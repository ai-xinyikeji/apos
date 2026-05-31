import { db } from '../db';

// Mock dependencies
const mockGit = {
  getRemotes: jest.fn(),
  branch: jest.fn(),
  checkout: jest.fn(),
  checkoutLocalBranch: jest.fn(),
  add: jest.fn(),
  commit: jest.fn(),
  push: jest.fn(),
  addRemote: jest.fn(),
  remote: jest.fn(),
};

jest.mock('simple-git', () => {
  return jest.fn(() => mockGit);
});

jest.mock('../db');

describe('Git Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockGit).forEach(fn => fn.mockReset());
  });

  describe('getRepoDetails', () => {
    it('should parse GitHub SSH URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: {
            push: 'git@github.com:owner/repo.git',
          },
        },
      ]);

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('should parse GitHub HTTPS URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: {
            push: 'https://github.com/owner/repo.git',
          },
        },
      ]);

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('should parse GitHub URL without .git extension', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: {
            push: 'https://github.com/owner/repo',
          },
        },
      ]);

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('should return null when origin remote not found', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'upstream',
          refs: {
            push: 'https://github.com/owner/repo.git',
          },
        },
      ]);

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toBeNull();
    });

    it('should return null when URL format is invalid', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: {
            push: 'https://gitlab.com/owner/repo.git',
          },
        },
      ]);

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockGit.getRemotes.mockRejectedValue(new Error('Git error'));

      const { getRepoDetails } = await import('../git');
      const result = await getRepoDetails();

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse repository details:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('createBranch', () => {
    it('should create branch from main', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature-1'],
      });
      mockGit.checkout.mockResolvedValue(undefined);
      mockGit.checkoutLocalBranch.mockResolvedValue(undefined);

      const { createBranch } = await import('../git');
      await createBranch('feature-2');

      expect(mockGit.checkout).toHaveBeenCalledWith('main');
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature-2');
    });

    it('should create branch from master when main does not exist', async () => {
      mockGit.branch.mockResolvedValue({
        all: ['master', 'feature-1'],
      });
      mockGit.checkout.mockResolvedValue(undefined);
      mockGit.checkoutLocalBranch.mockResolvedValue(undefined);

      const { createBranch } = await import('../git');
      await createBranch('feature-2');

      expect(mockGit.checkout).toHaveBeenCalledWith('master');
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature-2');
    });

    it('should throw error on failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockGit.branch.mockRejectedValue(new Error('Branch error'));

      const { createBranch } = await import('../git');
      await expect(createBranch('feature-2')).rejects.toThrow('Branch error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create branch feature-2:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('commitAndPush', () => {
    beforeEach(() => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({ commit: 'abc123' });
      mockGit.push.mockResolvedValue(undefined);
      mockGit.getRemotes.mockResolvedValue([]);
      mockGit.addRemote.mockResolvedValue(undefined);
      mockGit.remote.mockResolvedValue(undefined);
    });

    it('should commit and push with token from database', async () => {
      // Mock database settings
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'db_token_123' },
        ]),
      });

      // Mock getRemotes for getRepoDetails
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      const { commitAndPush } = await import('../git');
      const result = await commitAndPush('feature-branch', 'Test commit');

      expect(result).toBe('abc123');
      expect(mockGit.add).toHaveBeenCalledWith('./*');
      expect(mockGit.commit).toHaveBeenCalledWith('Test commit');
      expect(mockGit.addRemote).toHaveBeenCalledWith(
        'temp-origin',
        'https://x-access-token:db_token_123@github.com/owner/repo.git'
      );
      expect(mockGit.push).toHaveBeenCalledWith(
        'temp-origin',
        'feature-branch',
        ['--set-upstream', '--force']
      );
    });

    it('should use environment token when database token not available', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, GITHUB_TOKEN: 'env_token_456' };

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      const { commitAndPush } = await import('../git');
      await commitAndPush('feature-branch', 'Test commit');

      expect(mockGit.addRemote).toHaveBeenCalledWith(
        'temp-origin',
        'https://x-access-token:env_token_456@github.com/owner/repo.git'
      );

      process.env = originalEnv;
    });

    it('should push to origin when no token available', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const { commitAndPush } = await import('../git');
      await commitAndPush('feature-branch', 'Test commit');

      expect(mockGit.push).toHaveBeenCalledWith(
        'origin',
        'feature-branch',
        ['--set-upstream', '--force']
      );
    });

    it('should update existing temp-origin remote', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes
        .mockResolvedValueOnce([
          {
            name: 'origin',
            refs: { push: 'git@github.com:owner/repo.git' },
          },
        ])
        .mockResolvedValueOnce([
          { name: 'temp-origin' },
        ]);

      const { commitAndPush } = await import('../git');
      await commitAndPush('feature-branch', 'Test commit');

      expect(mockGit.remote).toHaveBeenCalledWith([
        'set-url',
        'temp-origin',
        'https://x-access-token:token_123@github.com/owner/repo.git',
      ]);
    });

    it('should throw error on failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockGit.add.mockRejectedValue(new Error('Add failed'));

      const { commitAndPush } = await import('../git');
      await expect(commitAndPush('feature-branch', 'Test commit')).rejects.toThrow('Add failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to commit and push for branch feature-branch:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('createPullRequest', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should create pull request successfully', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature-1'],
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        }),
      });

      const { createPullRequest } = await import('../git');
      const result = await createPullRequest(
        'Feature title',
        'Feature description',
        'feature-branch'
      );

      expect(result).toEqual({
        url: 'https://github.com/owner/repo/pull/1',
        number: 1,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'token token_123',
          }),
          body: JSON.stringify({
            title: 'Feature title',
            body: 'Feature description',
            head: 'feature-branch',
            base: 'main',
          }),
        })
      );
    });

    it('should use master as base when main does not exist', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      mockGit.branch.mockResolvedValue({
        all: ['master', 'feature-1'],
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        }),
      });

      const { createPullRequest } = await import('../git');
      await createPullRequest('Title', 'Body', 'feature-branch');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.base).toBe('master');
    });

    it('should use custom base branch', async () => {
      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        }),
      });

      const { createPullRequest } = await import('../git');
      await createPullRequest('Title', 'Body', 'feature-branch', 'develop');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.base).toBe('develop');
    });

    it('should return null when token not configured', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([]),
      });

      const { createPullRequest } = await import('../git');
      const result = await createPullRequest('Title', 'Body', 'feature-branch');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'GitHub Token not configured, skipping Pull Request creation.'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return null when repo details cannot be resolved', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes.mockResolvedValue([]);

      const { createPullRequest } = await import('../git');
      const result = await createPullRequest('Title', 'Body', 'feature-branch');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot resolve owner/repo detail for Pull Request.'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should throw error on API failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      (db.select as jest.Mock) = jest.fn().mockReturnValue({
        from: jest.fn().mockResolvedValue([
          { key: 'github_token', value: 'token_123' },
        ]),
      });

      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { push: 'git@github.com:owner/repo.git' },
        },
      ]);

      mockGit.branch.mockResolvedValue({
        all: ['main'],
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Bad credentials' }),
      });

      const { createPullRequest } = await import('../git');
      await expect(
        createPullRequest('Title', 'Body', 'feature-branch')
      ).rejects.toThrow('GitHub API error: Bad credentials');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create GitHub pull request:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
