// Mock for better-sqlite3 to prevent native addon loading in tests
const Database = jest.fn().mockImplementation(() => ({
  prepare: jest.fn().mockReturnValue({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn().mockReturnValue([]),
  }),
  exec: jest.fn(),
  close: jest.fn(),
  pragma: jest.fn(),
  transaction: jest.fn((fn) => fn),
}));

module.exports = Database;
