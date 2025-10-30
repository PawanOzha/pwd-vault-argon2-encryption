import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createCategory, getCategories, deleteCategory } from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this'
);

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) return null;
  
  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const categories = await getCategories(user.userId as number);
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { name, color } = await request.json();
  
  if (!name) {
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
  }
  
  const result = await createCategory(user.userId as number, name, color);
  
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  
  return NextResponse.json({ 
    message: 'Category created', 
    categoryId: result.categoryId 
  }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromToken(request);
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('id');
  
  if (!categoryId) {
    return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
  }
  
  const deleted = await deleteCategory(parseInt(categoryId), user.userId as number);
  
  if (!deleted) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }
  
  return NextResponse.json({ message: 'Category deleted' });
}