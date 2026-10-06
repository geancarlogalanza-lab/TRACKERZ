/**
 * Database schema types.
 *
 * Generated from the Supabase project. To refresh after a migration:
 *   npx supabase gen types typescript --project-id <ref> > src/data/database.types.ts
 *
 * The helper generics that command also emits (Tables<>, TablesInsert<>, …) are
 * left out; this app derives what it needs in `types.ts` instead.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Lets createClient pick the right options without an explicit generic.
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      captures: {
        Row: {
          ai_model: string | null
          ai_result: Json | null
          book_author: string
          book_title: string
          created_at: string
          error: string | null
          id: string
          location: string | null
          prompt_version: string | null
          raw_notes: string
          source_passage: string | null
          status: string
          status_changed_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_result?: Json | null
          book_author: string
          book_title: string
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          prompt_version?: string | null
          raw_notes: string
          source_passage?: string | null
          status?: string
          status_changed_at?: string
          user_id?: string
        }
        Update: {
          ai_model?: string | null
          ai_result?: Json | null
          book_author?: string
          book_title?: string
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          prompt_version?: string | null
          raw_notes?: string
          source_passage?: string | null
          status?: string
          status_changed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          basis: string | null
          capture_id: string
          created_at: string
          decision: string
          flags: Json
          id: string
          interpretation: string | null
          last_surfaced_at: string | null
          origin: string
          proposal_index: number | null
          retired_at: string | null
          surfaced_count: number
          text: string
          user_id: string
        }
        Insert: {
          basis?: string | null
          capture_id: string
          created_at?: string
          decision: string
          flags?: Json
          id?: string
          interpretation?: string | null
          last_surfaced_at?: string | null
          origin: string
          proposal_index?: number | null
          retired_at?: string | null
          surfaced_count?: number
          text: string
          user_id?: string
        }
        Update: {
          basis?: string | null
          capture_id?: string
          created_at?: string
          decision?: string
          flags?: Json
          id?: string
          interpretation?: string | null
          last_surfaced_at?: string | null
          origin?: string
          proposal_index?: number | null
          retired_at?: string | null
          surfaced_count?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_capture_id_user_id_fkey'
            columns: ['capture_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'captures'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      streak_records: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          note: string
          streak_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          note?: string
          streak_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          note?: string
          streak_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'streak_records_streak_id_fkey'
            columns: ['streak_id']
            isOneToOne: false
            referencedRelation: 'streaks'
            referencedColumns: ['id']
          },
        ]
      }
      streaks: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          trimester_id: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          trimester_id: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          trimester_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subjects_trimester_id_fkey'
            columns: ['trimester_id']
            isOneToOne: false
            referencedRelation: 'trimesters'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          deadline_date: string | null
          deadline_time: string | null
          description: string | null
          id: string
          planned_date: string | null
          planned_time: string | null
          subject_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline_date?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          planned_date?: string | null
          planned_time?: string | null
          subject_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline_date?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          planned_date?: string | null
          planned_time?: string | null
          subject_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      trimesters: {
        Row: {
          created_at: string
          id: string
          label: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
