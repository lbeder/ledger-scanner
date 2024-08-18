import fs from "fs";
import path from "path";
import AppETH from "@ledgerhq/hw-app-eth";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import chalk from "chalk";
import CliProgress from "cli-progress";
import Table from "cli-table";
import Decimal from "decimal.js";
import { JsonRpcProvider } from "ethers";
import { isEmpty, set } from "lodash";
import { Balance } from "./modules";
import { ETH } from "./utils/constants";
import { Logger } from "./utils/logger";

export const ADDRESS_INDEX = "N";
export const PATH_INDEX = "M";
export const DEFAULT_ADDRESS_COUNT = 100;
export const DEFAULT_PATH_COUNT = 1;
export const DEFAULT_PATH_PREFIX = `m/44'/60'/${PATH_INDEX}'/${ADDRESS_INDEX}`;
export const DEFAULT_START = 0;

interface ScannerOptions {
  providerUrl: string;
}

type Address = string;
interface LedgerAddress {
  index: number;
  path: string;
  address: Address;
}

type Asset = string;
type Amounts = Record<Asset, Decimal>;
type AddressAmounts = Record<Address, Amounts>;
type LedgerAddresses = Record<Address, LedgerAddress>;

interface ScanOptions {
  path: string;
  addressCount: number;
  addressStart: number;
  pathCount: number;
  pathStart: number;
  hideEmptyAddresses: boolean;
  csvOutputDir?: string;
}

export class Scanner {
  private provider: JsonRpcProvider;
  private balance: Balance;

  private static readonly BALANCES_BATCH = 100;
  private static readonly CSV_ADDRESSES_REPORT = "addresses.csv";

  constructor({ providerUrl }: ScannerOptions) {
    this.provider = new JsonRpcProvider(providerUrl);

    this.balance = new Balance(this.provider);
  }

  public async scan({
    path,
    addressStart,
    addressCount,
    pathCount,
    pathStart,
    hideEmptyAddresses,
    csvOutputDir
  }: ScanOptions) {
    if (addressCount === 0) {
      throw new Error("Invalid address count");
    }

    if (pathCount === 0) {
      throw new Error("Invalid path count");
    }

    if (!Scanner.verifyPath(path, ADDRESS_INDEX)) {
      throw new Error("Missing address index component");
    }

    if (!Scanner.verifyPath(path, PATH_INDEX)) {
      throw new Error("Missing path index component");
    }

    Logger.info(`Scanning all addresses at path ${path}...`);
    Logger.info();
    Logger.notice(`  Address count: ${addressCount}`);
    Logger.notice(`  Address start: ${addressStart}`);
    Logger.notice(`  Path count: ${pathCount}`);
    Logger.notice(`  Path start: ${pathStart}`);
    Logger.info();

    const transport = await TransportNodeHid.create();
    const appETH = new AppETH(transport);

    const ledgerAddresses: LedgerAddresses = {};

    const multiBar = new CliProgress.MultiBar(
      {
        format: " {label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );

    const ledgerBar = multiBar.create(addressCount * pathCount, 0);

    const amounts: AddressAmounts = {};

    for (let pathIndex = pathStart; pathIndex < pathStart + pathCount; ++pathIndex) {
      const derivationPath = path.replace(new RegExp(PATH_INDEX, "g"), pathIndex.toString());

      const balancePromises: Promise<void>[] = [];

      for (let addressIndex = addressStart; addressIndex < addressStart + addressCount; ++addressIndex) {
        const addressDerivationPath = derivationPath.replace(new RegExp(ADDRESS_INDEX, "g"), addressIndex.toString());

        const { address } = await appETH.getAddress(addressDerivationPath);

        ledgerAddresses[address] = { index: addressIndex, address, path: addressDerivationPath };

        const promise = this.balance.getBalance(address).then((ethBalance) => {
          if (!hideEmptyAddresses || !ethBalance.isZero()) {
            set(amounts, [address, ETH], ethBalance);
          }

          ledgerBar.increment(1, { label: `${addressDerivationPath} | ${address}` });
        });

        balancePromises.push(promise);

        if (balancePromises.length >= Scanner.BALANCES_BATCH) {
          await Promise.all(balancePromises);

          balancePromises.length = 0;
        }
      }

      // Await any remaining promises
      if (balancePromises.length > 0) {
        await Promise.all(balancePromises);
      }
    }

    ledgerBar.update(addressCount, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    this.showAddresses(ledgerAddresses, amounts);

    if (csvOutputDir) {
      this.exportAddresses(csvOutputDir, ledgerAddresses);
    }
  }

  private showAddresses(ledgerAddresses: LedgerAddresses, amounts: AddressAmounts) {
    if (isEmpty(amounts)) {
      return;
    }

    Logger.title("Addresses");

    const tokens = [ETH];
    const tokenHead = tokens.map((symbol) => chalk.cyanBright(symbol));
    const addressesTable = new Table({
      head: [chalk.cyanBright("Index"), chalk.cyanBright("Address"), ...tokenHead, chalk.cyanBright("Path")],
      colAligns: ["middle", "middle", ...Array(tokenHead.length).fill("middle"), "middle"]
    });

    for (const ledgerAddress of Object.values(ledgerAddresses)) {
      const { index, path, address } = ledgerAddress;
      const addressAmounts = amounts[address];
      const balances: string[] = [];

      for (const symbol of tokens) {
        if (addressAmounts === undefined) {
          continue;
        }

        const amount = addressAmounts[symbol] ?? new Decimal(0);

        balances.push(amount.toCSVAmount());
      }

      if (balances.length === 0) {
        continue;
      }

      addressesTable.push([index.toString(), address, ...balances, path]);
    }

    Logger.table(addressesTable);
  }

  private exportAddresses(outputDir: string, ledgerAddresses: LedgerAddresses) {
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, Scanner.CSV_ADDRESSES_REPORT);
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath);
    }

    const headers = ["Index", "Address", "Path"];

    fs.appendFileSync(outputPath, `${headers.join(",")}\n`);

    if (isEmpty(ledgerAddresses)) {
      return;
    }

    for (const ledgerAddress of Object.values(ledgerAddresses)) {
      const { index, path, address } = ledgerAddress;

      fs.appendFileSync(outputPath, `${[index, address, path].join(",")}\n`);
    }

    Logger.info(`Exported address data to: ${outputPath}`);
  }

  private static verifyPath(path: string, component: string) {
    const regex = new RegExp(`/${component}[/']?|/${component}['"]?$`);

    return regex.test(path);
  }
}
