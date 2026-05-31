import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/growth/optimize/apply
 * Body: { filePath: string, originalCodeSnippet: string, optimizedCodeSnippet: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { filePath, originalCodeSnippet, optimizedCodeSnippet } = await request.json();
    
    if (!filePath || originalCodeSnippet === undefined || optimizedCodeSnippet === undefined) {
      return NextResponse.json(
        { success: false, error: 'filePath, originalCodeSnippet, and optimizedCodeSnippet are required' },
        { status: 400 }
      );
    }
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
      
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        { success: false, error: `File not found at ${absolutePath}` },
        { status: 404 }
      );
    }
    
    const currentCode = fs.readFileSync(absolutePath, 'utf8');
    
    // Normalize endings and spaces to increase robustness in matches
    const cleanStr = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    
    const cleanCode = cleanStr(currentCode);
    const cleanOriginal = cleanStr(originalCodeSnippet);
    
    if (!cleanCode.includes(cleanOriginal)) {
      return NextResponse.json({
        success: false,
        error: 'Original code snippet not found in target file. It may have been modified or is formatted differently.',
      }, { status: 400 });
    }
    
    // Create a backup file for safety
    const backupPath = `${absolutePath}.bak`;
    fs.writeFileSync(backupPath, currentCode, 'utf8');
    
    // Replace the exact code snippet
    // We try to match with custom exact matching first, or fallback to fuzzy matching if exact fails due to whitespace issues
    let updatedCode = currentCode;
    if (currentCode.includes(originalCodeSnippet)) {
      updatedCode = currentCode.replace(originalCodeSnippet, optimizedCodeSnippet);
    } else {
      // Find the index of the matching cleaned segment and replace in the raw file
      // Since it's a critical action, we prefer exact or near-exact replacements
      const lines = currentCode.split('\n');
      const originalLines = originalCodeSnippet.split('\n').map((l: string) => l.trim()).filter(Boolean);
      
      // Let's do a search for the first and last lines of the snippet
      if (originalLines.length > 0) {
        const startLineIdx = lines.findIndex(l => l.trim() === originalLines[0]);
        const endLineIdx = lines.findIndex((l, idx) => idx >= startLineIdx && l.trim() === originalLines[originalLines.length - 1]);
        
        if (startLineIdx !== -1 && endLineIdx !== -1) {
          lines.splice(startLineIdx, endLineIdx - startLineIdx + 1, ...optimizedCodeSnippet.split('\n'));
          updatedCode = lines.join('\n');
        } else {
          return NextResponse.json({
            success: false,
            error: 'Failed to align whitespace of the snippet. Please update the file manually or verify target content.',
          }, { status: 400 });
        }
      } else {
        return NextResponse.json({
          success: false,
          error: 'Original snippet is empty.',
        }, { status: 400 });
      }
    }
    
    fs.writeFileSync(absolutePath, updatedCode, 'utf8');
    
    return NextResponse.json({
      success: true,
      message: 'Code optimized and applied successfully. Original file backed up.',
      backupFile: path.relative(/* turbopackIgnore: true */ process.cwd(), backupPath),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
