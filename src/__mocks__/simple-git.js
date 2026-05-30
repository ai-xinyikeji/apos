// Mock for simple-git to prevent file system checks at module load time
const mockGit = {
  getRemotes: jest.fn().mockResolvedValue([]),
  branch: jest.fn().mockResolvedValue({ all: ['main'] }),
  checkout: jest.fn().mockResolvedValue(undefined),
  checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
  add: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue({ commit: 'abc123' }),
  push: jest.fn().mockResolvedValue(undefined),
  addRemote: jest.fn().mockResolvedValue(undefined),
  remote: jest.fn().mockResolvedValue(undefined),
  diff: jest.fn().mockResolvedValue(''),
};

const simpleGit = jest.fn(() => mockGit);

module.exports = simpleGit;
module.exports.default = simpleGit;
module.exports.simpleGit = simpleGit;
