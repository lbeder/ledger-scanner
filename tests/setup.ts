// Mock console methods to avoid cluttering test output
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock the Logger to avoid console output during tests
jest.mock("../src/utils/logger", () => ({
  Logger: {
    info: jest.fn(),
    notice: jest.fn(),
    title: jest.fn(),
    table: jest.fn(),
    fatal: jest.fn()
  }
}));

// Mock cli-progress to avoid progress bar output during tests
jest.mock("cli-progress", () => ({
  SingleBar: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
    stop: jest.fn()
  })),
  Presets: {
    // eslint-disable-next-line camelcase
    shades_classic: {}
  }
}));

// Mock Decimal.js extensions
jest.mock("decimal.js", () => {
  const Decimal = jest.requireActual("decimal.js");
  Decimal.prototype.toCSV = jest.fn().mockReturnValue("1.5");
  Decimal.prototype.toCSVAmount = jest.fn().mockReturnValue("1.5");
  return Decimal;
});

// Mock constants
jest.mock("../src/utils/constants", () => ({
  ETH: "ETH"
}));
