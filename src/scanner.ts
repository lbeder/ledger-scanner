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

export const DEFAULT_PATH_PREFIX = "m/44'/60'/0'";
export const DEFAULT_COUNT = 100;

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
  count: number;
  showEmptyAddresses: boolean;
}

export const DEFAULT_SYMBOL_PRICE = 1;

export class Scanner {
  private provider: JsonRpcProvider;
  private balance: Balance;

  constructor({ providerUrl }: ScannerOptions) {
    this.provider = new JsonRpcProvider(providerUrl);

    this.balance = new Balance(this.provider);
  }

  public async scan({ path, count, showEmptyAddresses }: ScanOptions) {
    if (count === 0) {
      throw new Error("Invalid count");
    }

    Logger.info(`Scanning all addresses at path ${path}...`);
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

    const ledgerBar = multiBar.create(count, 0);

    const amounts: AddressAmounts = {};

    for (let index = 0; index < count; ++index) {
      const addressPath = `${path}/${index}`;
      const { address } = await appETH.getAddress(addressPath);

      ledgerAddresses[address] = { index, address, path: addressPath };

      const ethBalance = await this.balance.getBalance(address);
      if (showEmptyAddresses || !ethBalance.isZero()) {
        set(amounts, [address, ETH], ethBalance);
      }

      ledgerBar.increment(1, { label: `${addressPath} | ${address}` });
    }

    ledgerBar.update(count, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    this.showAddresses(ledgerAddresses, amounts);
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
        const amount = addressAmounts[symbol] ?? new Decimal(0);

        balances.push(amount.toCSVAmount());
      }

      addressesTable.push([index.toString(), address, ...balances, path]);
    }

    Logger.table(addressesTable);
  }
}
