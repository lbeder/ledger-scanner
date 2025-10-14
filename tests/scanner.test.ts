import * as fs from "fs";
import { Decimal } from "decimal.js";
import { M_INDEX, N_INDEX, O_INDEX, Scanner } from "../src/scanner";

// Mock all external dependencies
jest.mock("@ledgerhq/hw-transport-node-hid", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({
      close: jest.fn()
    })
  }
}));

// Mock HDKey
jest.mock("hdkey", () => {
  return jest.fn().mockImplementation(() => ({
    publicKey: null,
    chainCode: null,
    derive: jest.fn().mockReturnValue({
      publicKey: Buffer.from("02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9", "hex")
    })
  }));
});

jest.mock("@ledgerhq/hw-app-eth", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getAddress: jest.fn().mockResolvedValue({
      publicKey:
        "04f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9388f7b0f632d8141b5d52f0808e46464c246a143a0b02d14c35469bb34ce17a9",
      chainCode: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
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
    it(`should throw error for invalid ${O_INDEX} count`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          oCount: 0,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).toThrow(`Invalid ${O_INDEX} count`);
    });

    it(`should throw error for invalid ${M_INDEX} count`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 0,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).toThrow(`Invalid ${M_INDEX} count`);
    });

    it(`should throw error for invalid ${N_INDEX} count`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 0,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).toThrow(`Invalid ${N_INDEX} count`);
    });

    it(`should throw error for missing ${O_INDEX} index component`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'`,
          oCount: 1,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).toThrow(`Missing ${O_INDEX} index component`);
    });

    it(`should not throw error when mCount > 0 but path doesn't contain ${M_INDEX}`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).not.toThrow();
    });

    it(`should not throw error when nCount > 0 but path doesn't contain ${N_INDEX}`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).not.toThrow();
    });

    it(`should not throw error when mCount === 0 but path doesn't contain ${M_INDEX}`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 0,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).not.toThrow();
    });

    it(`should not throw error when nCount === 0 but path doesn't contain ${N_INDEX}`, () => {
      expect(() => {
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          oCount: 1,
          oStart: 0,
          mCount: 1,
          mStart: 0,
          nCount: 0,
          nStart: 0,
          hideSmallAddresses: false,
          skipBalance: false,
          csvOutputPath: undefined
        });
      }).not.toThrow();
    });
  });

  describe("exportAddresses", () => {
    it(`should throw error for invalid ${O_INDEX} count`, async () => {
      await expect(
        scanner.exportAddresses({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          oCount: 0,
          oStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow(`Invalid ${O_INDEX} count`);
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
        csvOutputPath: undefined
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
        csvOutputPath: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should export results to CSV when csvOutputPath is provided", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvOutputPath = "/tmp/output/addresses.csv";
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
        csvOutputPath
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/output", { recursive: true });
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });

    it("should throw error when CSV output file already exists", async () => {
      const inputPath = "/tmp/test-addresses.csv";
      const csvOutputPath = "/tmp/existing-file.csv";
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

      // Mock fs.existsSync to return true for the output file
      (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
        return filePath === csvOutputPath;
      });

      await expect(
        scanner.scanAddresses({
          hideSmallAddresses: false,
          skipBalance: true,
          inputPath,
          csvOutputPath
        })
      ).rejects.toThrow(`Output file already exists: ${csvOutputPath}`);
    });
  });

  describe("exportPubkeys", () => {
    it(`should throw error for invalid ${M_INDEX} count`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 0,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow(`Invalid ${M_INDEX} count`);
    });

    it(`should throw error for invalid ${N_INDEX} count`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 0,
          nStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow(`Invalid ${N_INDEX} count`);
    });

    it(`should throw error for missing ${O_INDEX} index component`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'`,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          outputPath: undefined
        })
      ).rejects.toThrow(`Missing ${O_INDEX} index component`);
    });

    it(`should not throw error when mCount === 0 but path doesn't contain ${M_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          mCount: 0,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should not throw error when nCount === 0 but path doesn't contain ${N_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 0,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
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
        csvOutputPath: undefined
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
        csvOutputPath: undefined
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
        csvOutputPath: undefined
      });

      expect(fs.createReadStream).toHaveBeenCalledWith(inputPath);
      expect(mockGetBalance).not.toHaveBeenCalled();

      // Verify that Logger methods were called to display results (without balance)
      expect(Logger.title).toHaveBeenCalledWith("Addresses");
      expect(Logger.table).toHaveBeenCalled();
    });
  });

  describe("path combinations", () => {
    it(`should handle path with both ${M_INDEX} and ${N_INDEX}`, async () => {
      await expect(
        scanner.exportAddresses({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle path with only ${M_INDEX}`, async () => {
      await expect(
        scanner.exportAddresses({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle path with only ${N_INDEX}`, async () => {
      await expect(
        scanner.exportAddresses({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle path with neither ${M_INDEX} nor ${N_INDEX}`, async () => {
      await expect(
        scanner.exportAddresses({
          path: `m/44'/60'/0'/0'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle scan with both ${M_INDEX} and ${N_INDEX}`, async () => {
      await expect(
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          hideSmallAddresses: false,
          skipBalance: true,
          csvOutputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle scan with only ${M_INDEX}`, async () => {
      await expect(
        scanner.scan({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          hideSmallAddresses: false,
          skipBalance: true,
          csvOutputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle scan with only ${N_INDEX}`, async () => {
      await expect(
        scanner.scan({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          hideSmallAddresses: false,
          skipBalance: true,
          csvOutputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle scan with neither ${M_INDEX} nor ${N_INDEX}`, async () => {
      await expect(
        scanner.scan({
          path: `m/44'/60'/0'/0'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          oCount: 1,
          oStart: 0,
          hideSmallAddresses: false,
          skipBalance: true,
          csvOutputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle exportPubkeys with both ${M_INDEX} and ${N_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle exportPubkeys with only ${M_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${M_INDEX}'/${O_INDEX}`,
          mCount: 2,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle exportPubkeys with only ${N_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/${N_INDEX}'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 2,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });

    it(`should handle exportPubkeys with neither ${M_INDEX} nor ${N_INDEX}`, async () => {
      await expect(
        scanner.exportPubkeys({
          path: `m/44'/60'/0'/0'/${O_INDEX}`,
          mCount: 1,
          mStart: 0,
          nCount: 1,
          nStart: 0,
          outputPath: undefined
        })
      ).resolves.not.toThrow();
    });
  });
});
