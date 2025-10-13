import * as fs from "fs";
import { Decimal } from "decimal.js";
import { Scanner } from "../src/scanner";

// Mock all external dependencies
jest.mock("@ledgerhq/hw-transport-node-hid", () => ({
  default: {
    create: jest.fn().mockResolvedValue({
      close: jest.fn()
    })
  }
}));

jest.mock("@ledgerhq/hw-app-eth", () => ({
  default: jest.fn().mockImplementation(() => ({
    getAddress: jest.fn().mockResolvedValue({
      publicKey:
        "0x04a1b2c3d4e5f678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789",
      chainCode: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    })
  }))
}));

// Mock the Balance module
const mockGetBalance = jest.fn().mockResolvedValue(new Decimal(1.5));
jest.mock("../src/modules", () => ({
  Balance: jest.fn().mockImplementation(() => ({
    getBalance: mockGetBalance
  }))
}));

jest.mock("fs", () => ({
  createReadStream: jest.fn(),
  mkdirSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
  appendFileSync: jest.fn()
}));

jest.mock("readline", () => ({
  createInterface: jest.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield "Index,Address,Path";
      yield "1,0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6,m/44'/60'/0'/0";
    }
  })
}));

// Mock console methods
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe("Scanner", () => {
  let scanner: Scanner;

  beforeEach(() => {
    jest.clearAllMocks();
    scanner = new Scanner({ rpc: "http://localhost:8545" });
  });

  describe("scan", () => {
    it("should throw error for invalid address count", () => {
      expect(() => {
        scanner.scan({
          path: "m/44'/60'/M'/N",
          addressCount: 0,
          addressStart: 0,
          pathCount: 1,
          pathStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputDir: undefined
        });
      }).toThrow("Invalid address count");
    });

    it("should throw error for invalid path count", () => {
      expect(() => {
        scanner.scan({
          path: "m/44'/60'/M'/N",
          addressCount: 1,
          addressStart: 0,
          pathCount: 0,
          pathStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputDir: undefined
        });
      }).toThrow("Invalid path count");
    });

    it("should throw error for missing address index component", () => {
      expect(() => {
        scanner.scan({
          path: "m/44'/60'/0'",
          addressCount: 1,
          addressStart: 0,
          pathCount: 1,
          pathStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputDir: undefined
        });
      }).toThrow("Missing address index component");
    });

    it("should throw error for missing path index component", () => {
      expect(() => {
        scanner.scan({
          path: "m/44'/60'/N",
          addressCount: 1,
          addressStart: 0,
          pathCount: 1,
          pathStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputDir: undefined
        });
      }).toThrow("Missing path index component");
    });
  });

  describe("exportAddresses", () => {
    it("should throw error for invalid address count", async () => {
      await expect(
        scanner.exportAddresses({
          path: "m/44'/60'/M'/N",
          pathCount: 1,
          pathStart: 0,
          addressCount: 0,
          addressStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow("Invalid address count");
    });
  });

  describe("scanAddresses", () => {
    it("should scan addresses from addresses file", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvContent = `Index,Address,Path
1,0x1234567890123456789012345678901234567890,m/44'/60'/0'/0`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock Logger methods
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: false,
        skipBalance: false,
        inputPath,
        csvOutputDir: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should skip balance check when skipBalance is true", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvContent = `Index,Address,Path
1,0x1234567890123456789012345678901234567890,m/44'/60'/0'/0`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock Logger methods
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: false,
        skipBalance: true,
        inputPath,
        csvOutputDir: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should export results to CSV when csvOutputDir is provided", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvOutputDir = "/tmp/output";
      const csvContent = `Index,Address,Path
1,0x1234567890123456789012345678901234567890,m/44'/60'/0'/0`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock Logger methods
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: false,
        skipBalance: true,
        inputPath,
        csvOutputDir
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(csvOutputDir, { recursive: true });
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });
  });

  describe("exportPubkeys", () => {
    it("should throw error for invalid path count", async () => {
      await expect(
        scanner.exportPubkeys({
          path: "m/44'/60'/M'/N",
          pathCount: 0,
          pathStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow("Invalid path count");
    });

    it("should throw error for missing address index component", async () => {
      await expect(
        scanner.exportPubkeys({
          path: "m/44'/60'/0'",
          pathCount: 1,
          pathStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow("Missing address index component");
    });
  });

  describe("address scanning from CSV", () => {
    const mockAddresses = [
      "0x1234567890123456789012345678901234567890",
      "0x2345678901234567890123456789012345678901",
      "0x3456789012345678901234567890123456789012"
    ];

    beforeEach(() => {
      // Reset the mock before each test
      mockGetBalance.mockClear();
    });

    it("should scan addresses from CSV file with correct balances", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvContent = `Index,Address,Path
1,${mockAddresses[0]},m/44'/60'/0'/0
2,${mockAddresses[1]},m/44'/60'/0'/1
3,${mockAddresses[2]},m/44'/60'/0'/2`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock balance checks with specific values
      mockGetBalance
        .mockResolvedValueOnce(new Decimal("1.5"))
        .mockResolvedValueOnce(new Decimal("0.0"))
        .mockResolvedValueOnce(new Decimal("10.25"));

      // Mock Logger methods to capture the results
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: false,
        skipBalance: false,
        inputPath,
        csvOutputDir: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(mockGetBalance).toHaveBeenCalledTimes(3);
      expect(mockGetBalance).toHaveBeenCalledWith(mockAddresses[0]);
      expect(mockGetBalance).toHaveBeenCalledWith(mockAddresses[1]);
      expect(mockGetBalance).toHaveBeenCalledWith(mockAddresses[2]);

      // Verify that Logger methods were called to display results
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should hide small addresses when hideSmallAddresses is true", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvContent = `Index,Address,Path
1,${mockAddresses[0]},m/44'/60'/0'/0
2,${mockAddresses[1]},m/44'/60'/0'/1
3,${mockAddresses[2]},m/44'/60'/0'/2`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock balance checks - one small balance, one zero, one large
      mockGetBalance
        .mockResolvedValueOnce(new Decimal("0.001")) // Small balance
        .mockResolvedValueOnce(new Decimal("0.0")) // Zero balance
        .mockResolvedValueOnce(new Decimal("10.25")); // Large balance

      // Mock Logger methods to capture the results
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: true,
        skipBalance: false,
        inputPath,
        csvOutputDir: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(mockGetBalance).toHaveBeenCalledTimes(3);

      // Verify that Logger methods were called to display results
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should skip balance check when skipBalance is true", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvContent = `Index,Address,Path
1,${mockAddresses[0]},m/44'/60'/0'/0
2,${mockAddresses[1]},m/44'/60'/0'/1`;

      // Mock file reading
      const mockReadStream = {
        on: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };

      (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream as any);

      // Mock readline
      const readline = jest.requireMock("readline");
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          for (const line of csvContent.split("\n")) {
            yield line;
          }
        }
      };
      readline.createInterface.mockReturnValue(mockRl);

      // Mock Logger methods to capture the results
      const Logger = jest.requireMock("../src/utils/logger").Logger;

      await scanner.scanAddresses({
        hideSmallAddresses: false,
        skipBalance: true,
        inputPath,
        csvOutputDir: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(mockGetBalance).not.toHaveBeenCalled();

      // Verify that Logger methods were called to display results (without balance)
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });
  });
});
