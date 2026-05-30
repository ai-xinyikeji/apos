import simpleGit from 'simple-git';
import { db } from './db';
import { settings } from './schema';
import { eq } from 'drizzle-orm';

export const git = simpleGit(process.cwd());

export interface RepoDetails {
  owner: string;
  repo: string;
}

/**
 * Parses GitHub repository owner and name from origin remote URL.
 */
export async function getRepoDetails(): Promise<RepoDetails | null> {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) return null;

    const url = origin.refs.push;
    // Matches formats: git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/);
    if (!match) return null;

    return {
      owner: match[1],
      repo: match[2],
    };
  } catch (error) {
    console.error('Failed to parse repository details:', error);
    return null;
  }
}

/**
 * Creates and checks out a new branch.
 */
export async function createBranch(branchName: string) {
  try {
    // Switch to main or main branch to branch off of
    const branches = await git.branch();
    const mainBranch = branches.all.includes('main') ? 'main' : 'master';
    
    await git.checkout(mainBranch);
    await git.checkoutLocalBranch(branchName);
  } catch (error) {
    console.error(`Failed to create branch ${branchName}:`, error);
    throw error;
  }
}

/**
 * Adds, commits, and pushes files to GitHub.
 * Uses the SQLite github_token to authenticate push if available.
 */
export async function commitAndPush(branchName: string, message: string): Promise<string | null> {
  try {
    await git.add('./*');
    const commitResult = await git.commit(message);
    const commitHash = commitResult.commit;

    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));
    const token = keysMap.get('github_token') || process.env.GITHUB_TOKEN;

    if (token) {
      const details = await getRepoDetails();
      if (details) {
        // Construct remote URL with token for pushing
        const remoteUrl = `https://x-access-token:${token}@github.com/${details.owner}/${details.repo}.git`;
        
        // Add/set temp-origin for token authenticated push
        const remotes = await git.getRemotes();
        const hasTempOrigin = remotes.some(r => r.name === 'temp-origin');
        if (hasTempOrigin) {
          await git.remote(['set-url', 'temp-origin', remoteUrl]);
        } else {
          await git.addRemote('temp-origin', remoteUrl);
        }
        
        await git.push('temp-origin', branchName, ['--set-upstream', '--force']);
      } else {
        await git.push('origin', branchName, ['--set-upstream', '--force']);
      }
    } else {
      await git.push('origin', branchName, ['--set-upstream', '--force']);
    }
    
    return commitHash || null;
  } catch (error) {
    console.error(`Failed to commit and push for branch ${branchName}:`, error);
    throw error;
  }
}

/**
 * Submits a new Pull Request on GitHub.
 */
export async function createPullRequest(
  title: string, 
  body: string, 
  head: string, 
  base: string = 'main'
): Promise<{ url: string; number: number } | null> {
  try {
    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));
    const token = keysMap.get('github_token') || process.env.GITHUB_TOKEN;

    if (!token) {
      console.warn('GitHub Token not configured, skipping Pull Request creation.');
      return null;
    }

    const details = await getRepoDetails();
    if (!details) {
      console.warn('Cannot resolve owner/repo detail for Pull Request.');
      return null;
    }

    const targetBase = base === 'main' ? (await git.branch()).all.includes('main') ? 'main' : 'master' : base;

    const res = await fetch(`https://api.github.com/repos/${details.owner}/${details.repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base: targetBase,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`GitHub API error: ${err.message || res.statusText}`);
    }

    const data = await res.json();
    return {
      url: data.html_url,
      number: data.number,
    };
  } catch (error) {
    console.error('Failed to create GitHub pull request:', error);
    throw error;
  }
}
