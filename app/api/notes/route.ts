import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote
} from '@/lib/db';
import { getUserByUsername } from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this'
);

// ✅ Matching your exact auth pattern from credentials route
async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload;

    if (!payload?.username) {
      console.error('Invalid JWT payload (missing username):', payload);
      return null;
    }

    const dbUser = await getUserByUsername(payload.username as string);
    if (!dbUser) {
      console.error('User not found for username:', payload.username);
      return null;
    }

    return {
      userId: dbUser.id,
      username: dbUser.username,
    };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// ===================== GET =====================
export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    console.log('Unauthorized access attempt to notes');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const notes = await getNotes(user.userId);
    console.log(`Fetched ${notes.length} notes for user ${user.userId}`);

    return NextResponse.json({ notes });
  } catch (error: any) {
    console.error('Failed to fetch notes:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

// ===================== POST =====================
export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, content, color } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const result = await createNote(
      user.userId,
      title,
      content || '',
      color || '#fbbf24'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to create note' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Note created',
      noteId: result.noteId
    }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create note:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create note' },
      { status: 500 }
    );
  }
}

// ===================== PUT =====================
export async function PUT(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, ...updateData } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      );
    }

    // Verify note belongs to user
    const note = await getNote(id, user.userId);
    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    const success = await updateNote(id, user.userId, updateData);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Note updated' });
  } catch (error: any) {
    console.error('Failed to update note:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update note' },
      { status: 500 }
    );
  }
}

// ===================== DELETE =====================
export async function DELETE(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      );
    }

    // Verify note belongs to user
    const note = await getNote(parseInt(id), user.userId);
    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    const success = await deleteNote(parseInt(id), user.userId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Note deleted' });
  } catch (error: any) {
    console.error('Failed to delete note:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete note' },
      { status: 500 }
    );
  }
}