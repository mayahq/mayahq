import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Model ID is required' }, 
        { status: 400 }
      );
    }

    // First check if the model exists
    const { data: existingModel, error: checkError } = await supabase
      .from('maya_custom_models')
      .select('name, provider')
      .eq('id', id)
      .single();

    if (checkError || !existingModel) {
      return NextResponse.json(
        { error: 'Model not found' }, 
        { status: 404 }
      );
    }

    // Delete the model (soft delete by setting is_active to false)
    const { error: deleteError } = await supabase
      .from('maya_custom_models')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting model:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    console.log(`Deleted model: ${existingModel.name} (${existingModel.provider})`);

    return NextResponse.json({
      message: 'Model deleted successfully',
      modelName: existingModel.name
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/models/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}