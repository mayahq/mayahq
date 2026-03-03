'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Database } from '@/lib/database.types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { ImageUpload } from '@/components/ui/image-upload'
import { ControllerRenderProps, useFormContext } from 'react-hook-form'
import { DateTimePicker } from '@/components/ui/date-picker'

type Post = Database['public']['Tables']['posts']['Row']

// Utility function to generate a slug
const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^a-z0-9-]/g, '') // Remove special characters
    .replace(/-+/g, '-'); // Replace multiple - with single -
};

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  body: z.string().min(1, 'Content is required'),
  slug: z.string().min(1, 'Slug is required'),
  status: z.enum(['draft', 'published']),
  cover_image: z.string().optional().nullable(),
  post_type: z.enum(['regular', 'chapter']).optional(),
  date_range: z.string().optional(),
  word_count: z.number().optional(),
  published_at: z.string().optional().nullable(),
})

type FormValues = z.infer<typeof formSchema>

interface PostFormProps {
  initialData?: Post
}

export function PostForm({ initialData }: PostFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { supabase, user: authUser } = useAuth()

  // Calculate word count
  const calculateWordCount = (text: string) => {
    if (!text || text.trim().length === 0) return 0
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  // Better handling of initial data for chapters
  const getInitialPostType = () => {
    if (!initialData) return 'regular'
    const postType = (initialData as any)?.post_type
    return postType === 'chapter' ? 'chapter' : 'regular'
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      body: initialData?.body || '',
      slug: initialData?.slug || '',
      status: (initialData?.status as 'draft' | 'published') || 'draft',
      cover_image: initialData?.cover_image || '',
      post_type: getInitialPostType(),
      date_range: (initialData as any)?.date_range || '',
      word_count: (initialData as any)?.word_count || calculateWordCount(initialData?.body || ''),
      published_at: initialData?.published_at || null,
    },
  })

  // Watch body changes to update word count
  const bodyValue = form.watch('body')
  const postType = form.watch('post_type')

  // Update word count when body changes
  useEffect(() => {
    const wordCount = calculateWordCount(bodyValue || '')
    form.setValue('word_count', wordCount)
  }, [bodyValue, form])

  const onSubmit = async (values: FormValues) => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot save post.')
      return
    }
    if (!authUser) {
      toast.error('Not authenticated. Please log in.')
      return
    }
    
    console.log('Form submission values:', values) // Debug log
    
    try {
      setLoading(true)

      // Prepare the data more carefully
      const postData: any = {
        title: values.title,
        description: values.description || null,
        body: values.body,
        slug: values.slug,
        status: values.status,
        cover_image: values.cover_image || null,
        updated_at: new Date().toISOString(),
        published_at: values.status === 'published' ? 
          (values.published_at || new Date().toISOString()) : 
          null,
      }

      // Add optional fields with proper null handling
      if (values.post_type) {
        postData.post_type = values.post_type
      }
      if (values.date_range) {
        postData.date_range = values.date_range
      }
      if (values.word_count !== undefined && values.word_count !== null) {
        postData.word_count = values.word_count
      }

      console.log('Submitting post data:', postData) // Debug log

      if (initialData) {
        // Update existing post
        const { error } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', initialData.id)

        if (error) {
          console.error('Supabase update error:', error) // Debug log
          throw error
        }
        toast.success('Post updated successfully')
      } else {
        // Create new post
        const insertData = {
          ...postData,
          created_at: new Date().toISOString(),
          created_by: authUser.id,
        }
        
        const { error } = await supabase
          .from('posts')
          .insert([insertData])

        if (error) {
          console.error('Supabase insert error:', error) // Debug log
          throw error
        }
        toast.success('Post created successfully')
      }

      router.push('/admin/posts')
      router.refresh()
    } catch (error) {
      console.error('Error saving post:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      toast.error(`Failed to save post: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Post title" 
                  {...field} 
                  onChange={(e) => {
                    field.onChange(e); // Call original onChange
                    const newTitle = e.target.value;
                    const slug = generateSlug(newTitle);
                    form.setValue('slug', slug, { shouldValidate: true });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Brief description of the post" 
                  {...field} 
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                This will be displayed in post previews and meta tags.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="post-url-slug" {...field} />
              </FormControl>
              <FormDescription>
                The URL-friendly version of the title.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="post_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Post Type</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select post type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="regular">Regular Post</SelectItem>
                    <SelectItem value="chapter">Chapter</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select post status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="published_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Published Date</FormLabel>
                <FormControl>
                  <DateTimePicker
                    date={field.value ? new Date(field.value) : undefined}
                    setDate={(date) => field.onChange(date ? date.toISOString() : null)}
                  />
                </FormControl>
                <FormDescription>
                  When this post was or should be published. Leave empty for current time when published.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {postType === 'chapter' && (
            <FormField
              control={form.control}
              name="date_range"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Range</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 2024-01-01 to 2024-01-31" {...field} />
                  </FormControl>
                  <FormDescription>
                    The time period this chapter covers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Post content in MDX format" 
                  className="min-h-[300px] font-mono"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="cover_image"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cover Image</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value || ''}
                    onChange={field.onChange}
                    bucket="public"
                    path={`posts/${form.watch('slug') || 'new'}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="word_count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Word Count</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Calculated automatically"
                    value={field.value || 0}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    readOnly
                  />
                </FormControl>
                <FormDescription>
                  Automatically calculated from content.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : initialData ? 'Update Post' : 'Create Post'}
        </Button>
      </form>
    </Form>
  )
} 