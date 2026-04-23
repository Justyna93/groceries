// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the CLI is set up.

export type Database = {
  public: {
    Tables: {
      members: {
        Row: {
          id: string
          email: string
          name: string
          initials: string
          profile_id: string | null
          pending: boolean
          last_seen_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          initials: string
          profile_id?: string | null
          pending?: boolean
          last_seen_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['members']['Insert']>
        Relationships: []
      }
      lists: {
        Row: {
          id: string
          title: string
          date: string
          notes: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title?: string
          date?: string
          notes?: string
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['lists']['Insert']>
        Relationships: []
      }
      items: {
        Row: {
          id: string
          list_id: string
          text: string
          done: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          list_id: string
          text?: string
          done?: boolean
          position?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['items']['Insert']>
        Relationships: []
      }
      photos: {
        Row: {
          id: string
          list_id: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          list_id: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['photos']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_member: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}
