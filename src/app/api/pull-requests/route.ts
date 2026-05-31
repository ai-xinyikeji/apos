import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prototypes } from '@/lib/schema';
import { settings } from '@/lib/schema';
import { getRepoDetails } from '@/lib/git';
import { eq, desc, or } from 'drizzle-orm';

export async function GET() {
  try {
    // 1. Fetch generated prototype records from local SQLite
    const localProtos = await db.select()
      .from(prototypes)
      .where(or(
        eq(prototypes.status, 'generated'),
        eq(prototypes.status, 'pr_created'),
        eq(prototypes.status, 'merged')
      ))
      .orderBy(desc(prototypes.createdAt));
      
    // 2. Fetch GitHub PR lists if token and remote exist
    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));
    const token = keysMap.get('github_token') || process.env.GITHUB_TOKEN;
    const details = await getRepoDetails();

    let githubPRs: any[] = [];
    if (token && details) {
      try {
        const res = await fetch(`https://api.github.com/repos/${details.owner}/${details.repo}/pulls?state=all&per_page=30`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
          }
        });
        if (res.ok) {
          githubPRs = await res.json();
        }
      } catch (err) {
        console.warn('GitHub Pull Request list fetching failed, using local fallback:', err);
      }
    }

    // 3. Merge local metadata with GitHub PR states (matches by branchName)
    const syncedList = localProtos.map(proto => {
      const matchedPR = githubPRs.find(pr => pr.head.ref === proto.branchName);
      
      // Map GitHub PR state (merged, open, closed) to standard status
      let mappedStatus = proto.status;
      if (matchedPR) {
        if (matchedPR.merged_at) {
          mappedStatus = 'merged';
        } else if (matchedPR.state === 'closed') {
          mappedStatus = 'closed';
        } else if (matchedPR.state === 'open') {
          mappedStatus = 'pr_created';
        }
      }

      return {
        id: proto.id,
        name: proto.name,
        description: proto.description,
        branchName: proto.branchName,
        status: mappedStatus,
        commitHash: proto.commitHash,
        prNumber: matchedPR ? matchedPR.number : proto.prNumber,
        prUrl: matchedPR ? matchedPR.html_url : proto.prUrl,
        createdAt: proto.createdAt,
        updatedAt: proto.updatedAt,
      };
    });

    return NextResponse.json(syncedList);
  } catch (error: any) {
    console.error('Failed to query pull request route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
