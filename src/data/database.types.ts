/**
 * Database schema types.
 *
 * Generated from the Supabase project. To refresh after a migration:
 *   npx supabase gen types typescript --project-id <ref> > src/data/database.types.ts
 *
 * The helper generics that command also emits (Tables<>, TablesInsert<>, …) are
 * left out; this app derives what it needs in `types.ts` instead.
 */

export type Database = {
  // Lets createClient pick the right options without an explicit generic.
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
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
