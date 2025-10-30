import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import {
  createCredential,
  getCredentials,
  updateCredential,
  deleteCredential,
  searchCredentials,
  getUserByUsername, // ✅ Added: to fetch user salt
} from '@/lib/db';
import { deriveEncryptionKey, encryptPassword, decryptPassword } from '@/lib/encryption';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this'
);

// ✅ Enhanced: Fetch full user data (including salt)
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

    // 🧩 Auto-generate salt if missing (safety net)
    if (!dbUser.salt) {
      const newSalt = crypto.randomBytes(16).toString('hex');
      console.warn(`Salt missing for user ${dbUser.username}. Generating new salt.`);
      dbUser.salt = newSalt;
    }

    return {
      userId: dbUser.id,
      username: dbUser.username,
      salt: dbUser.salt,
    };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

/**
 * Helper: safely retrieve master password.
 * Priority:
 *  1) custom header 'x-master-password' (preferred, not logged)
 *  2) query param 'masterPassword' (legacy, insecure — accepted only for backwards compatibility)
 */
function getMasterPasswordFromRequest(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const masterFromHeader = request.headers.get('x-master-password');
  const masterFromQuery = searchParams.get('masterPassword');

  if (masterFromHeader) return masterFromHeader;

  if (masterFromQuery) {
    console.warn('⚠️ Security warning: masterPassword provided in query string. Move client to use header or POST body.');
    return masterFromQuery;
  }

  return null;
}

// ===================== GET =====================
export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');
  const search = searchParams.get('search');
  const masterPassword = getMasterPasswordFromRequest(request);

  if (!masterPassword) {
    return NextResponse.json(
      { error: 'Master password required for decryption. Provide via header "x-master-password".' },
      { status: 400 }
    );
  }

  if (!user.salt) {
    console.error('Missing user.salt for user:', user.userId ?? '(unknown id)');
    return NextResponse.json(
      { error: 'User salt missing. Please initialize your master password/salt for this account.' },
      { status: 400 }
    );
  }

  try {
    const encryptionKey = await deriveEncryptionKey(masterPassword, user.salt);
    let credentials;

    if (search) {
      credentials = await searchCredentials(user.userId, search);
    } else if (categoryId) {
      const catId = categoryId === 'null' ? null : parseInt(categoryId);
      credentials = await getCredentials(user.userId, catId);
    } else {
      credentials = await getCredentials(user.userId);
    }

    const decryptedCredentials = credentials.map((cred: any) => ({
      ...cred,
      password: decryptPassword(cred.password, encryptionKey),
    }));

    return NextResponse.json({ credentials: decryptedCredentials });
  } catch (error: any) {
    console.error('Decryption error:', error);

    if (error?.code === 'ERR_INVALID_ARG_TYPE' || /salt/i.test(String(error?.message || ''))) {
      return NextResponse.json(
        { error: 'Invalid or missing salt/master password. Cannot derive encryption key.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to decrypt passwords. Invalid master password or server error.' },
      { status: 500 }
    );
  }
}

// ===================== POST =====================
export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { categoryId, title, siteLink, username, password, description, masterPassword } =
    await request.json();

  if (!title || !password)
    return NextResponse.json({ error: 'Title and password are required' }, { status: 400 });
  if (!masterPassword)
    return NextResponse.json({ error: 'Master password required for encryption' }, { status: 400 });
  if (!user.salt)
    return NextResponse.json({ error: 'User salt missing. Please initialize your master password/salt for this account.' }, { status: 400 });

  try {
    const encryptionKey = await deriveEncryptionKey(masterPassword, user.salt);
    const encryptedPassword = encryptPassword(password, encryptionKey);

    const result = await createCredential(
      user.userId,
      categoryId || null,
      title,
      siteLink || '',
      username || '',
      encryptedPassword,
      description || ''
    );

    return NextResponse.json(
      { message: 'Credential created', credentialId: result.credentialId },
      { status: 201 }
    );
  } catch (error) {
    console.error('Encryption error:', error);
    return NextResponse.json({ error: 'Failed to encrypt password' }, { status: 500 });
  }
}

// ===================== PUT =====================
export async function PUT(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, password, masterPassword, ...data } = await request.json();
  if (!id) return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 });

  try {
    let updateData = { ...data };

    if (password) {
      if (!masterPassword)
        return NextResponse.json({ error: 'Master password required to update password' }, { status: 400 });
      if (!user.salt)
        return NextResponse.json({ error: 'User salt missing. Please initialize your master password/salt for this account.' }, { status: 400 });

      const encryptionKey = await deriveEncryptionKey(masterPassword, user.salt);
      updateData.password = encryptPassword(password, encryptionKey);
    }

    const updated = await updateCredential(id, user.userId, updateData);
    if (!updated) return NextResponse.json({ error: 'Credential not found' }, { status: 404 });

    return NextResponse.json({ message: 'Credential updated' });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 });
  }
}

// ===================== DELETE =====================
export async function DELETE(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const credentialId = searchParams.get('id');
  if (!credentialId)
    return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 });

  const deleted = await deleteCredential(parseInt(credentialId), user.userId);
  if (!deleted) return NextResponse.json({ error: 'Credential not found' }, { status: 404 });

  return NextResponse.json({ message: 'Credential deleted' });
}
