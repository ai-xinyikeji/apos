import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows as dbWorkflows } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const SYSTEM_WORKFLOW_NAMES = [
  'prototype-full-cycle',
  'insights-pipeline',
  'parallel-prototype-batch'
];

/**
 * POST /api/orchestrator/manage
 * Create or update a custom workflow definition
 * Body: { name: string, description: string, tasks: any[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { name, description, tasks } = await request.json();
    
    if (!name || !description || !tasks) {
      return NextResponse.json(
        { success: false, error: 'name, description, and tasks are required' },
        { status: 400 }
      );
    }
    
    // Normalize workflow name (slugify)
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    
    if (!normalizedName) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow name' },
        { status: 400 }
      );
    }
    
    // Guard against overwriting built-in system workflows
    if (SYSTEM_WORKFLOW_NAMES.includes(normalizedName)) {
      return NextResponse.json(
        { success: false, error: 'Cannot modify system default workflows' },
        { status: 403 }
      );
    }
    
    // Basic tasks array validation
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'tasks must be a non-empty array' },
        { status: 400 }
      );
    }
    
    // Validate each task in the array
    for (const t of tasks) {
      if (!t.id || !t.name || !t.type) {
        return NextResponse.json(
          { success: false, error: `Invalid task format: tasks must have 'id', 'name', and 'type'` },
          { status: 400 }
        );
      }
      if (!['agent', 'shell'].includes(t.type)) {
        return NextResponse.json(
          { success: false, error: `Invalid task type: ${t.type}. Must be 'agent' or 'shell'` },
          { status: 400 }
        );
      }
      if (t.type === 'agent' && !t.agentName) {
        return NextResponse.json(
          { success: false, error: `Task ${t.id} of type 'agent' must specify an 'agentName'` },
          { status: 400 }
        );
      }
      if (t.type === 'shell' && !t.command) {
        return NextResponse.json(
          { success: false, error: `Task ${t.id} of type 'shell' must specify a 'command'` },
          { status: 400 }
        );
      }
    }
    
    // Save to database
    // We check if it exists first. If so, update it. If not, insert.
    const [existing] = await db
      .select()
      .from(dbWorkflows)
      .where(eq(dbWorkflows.name, normalizedName));
      
    if (existing) {
      await db
        .update(dbWorkflows)
        .set({
          description,
          tasks: JSON.stringify(tasks),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dbWorkflows.name, normalizedName));
    } else {
      await db
        .insert(dbWorkflows)
        .values({
          name: normalizedName,
          description,
          tasks: JSON.stringify(tasks),
        });
    }
    
    return NextResponse.json({
      success: true,
      message: existing ? 'Workflow updated successfully' : 'Workflow created successfully',
      name: normalizedName,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orchestrator/manage
 * Delete a custom workflow definition
 * Body: { name: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { name } = await request.json();
    
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }
    
    if (SYSTEM_WORKFLOW_NAMES.includes(name)) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete system default workflows' },
        { status: 403 }
      );
    }
    
    // Delete from database
    const result = await db
      .delete(dbWorkflows)
      .where(eq(dbWorkflows.name, name));
      
    return NextResponse.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
