export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      gc_ai_usage: {
        Row: {
          created_at: string
          error: string | null
          id: string
          model: string
          ok: boolean
          provider: string
          purpose: string | null
          status_code: number | null
          tokens: number | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          model: string
          ok?: boolean
          provider: string
          purpose?: string | null
          status_code?: number | null
          tokens?: number | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          model?: string
          ok?: boolean
          provider?: string
          purpose?: string | null
          status_code?: number | null
          tokens?: number | null
        }
        Relationships: []
      }
      gc_clone_jobs: {
        Row: {
          ai_aciah_impact: string | null
          ai_categories: string[] | null
          ai_date: string | null
          ai_model: string | null
          ai_page_count: number | null
          ai_people: string[] | null
          ai_read_at: string | null
          ai_source_type: string | null
          ai_summary: string | null
          ai_title: string | null
          attempts: number
          clone_file_id: string | null
          clone_link: string | null
          clone_name: string | null
          content_key: string | null
          created_at: string
          drive_file_id: string
          duplicate_of: string | null
          error: string | null
          exhibit_id: string
          file_name: string
          folder_path: string
          mime_type: string
          original_pages: number | null
          status: string
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          ai_aciah_impact?: string | null
          ai_categories?: string[] | null
          ai_date?: string | null
          ai_model?: string | null
          ai_page_count?: number | null
          ai_people?: string[] | null
          ai_read_at?: string | null
          ai_source_type?: string | null
          ai_summary?: string | null
          ai_title?: string | null
          attempts?: number
          clone_file_id?: string | null
          clone_link?: string | null
          clone_name?: string | null
          content_key?: string | null
          created_at?: string
          drive_file_id: string
          duplicate_of?: string | null
          error?: string | null
          exhibit_id: string
          file_name: string
          folder_path?: string
          mime_type?: string
          original_pages?: number | null
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          ai_aciah_impact?: string | null
          ai_categories?: string[] | null
          ai_date?: string | null
          ai_model?: string | null
          ai_page_count?: number | null
          ai_people?: string[] | null
          ai_read_at?: string | null
          ai_source_type?: string | null
          ai_summary?: string | null
          ai_title?: string | null
          attempts?: number
          clone_file_id?: string | null
          clone_link?: string | null
          clone_name?: string | null
          content_key?: string | null
          created_at?: string
          drive_file_id?: string
          duplicate_of?: string | null
          error?: string | null
          exhibit_id?: string
          file_name?: string
          folder_path?: string
          mime_type?: string
          original_pages?: number | null
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      gc_job_secret: {
        Row: {
          created_at: string
          id: boolean
          token: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          token?: string
        }
        Relationships: []
      }
      gc_job_state: {
        Row: {
          files: number
          folders: number
          id: boolean
          last_run_at: string | null
          last_run_cloned: number
          last_run_queued: number
          last_tree_sync_at: string | null
          lease_until: string | null
          note: string | null
          paused_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          files?: number
          folders?: number
          id?: boolean
          last_run_at?: string | null
          last_run_cloned?: number
          last_run_queued?: number
          last_tree_sync_at?: string | null
          lease_until?: string | null
          note?: string | null
          paused_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          files?: number
          folders?: number
          id?: boolean
          last_run_at?: string | null
          last_run_cloned?: number
          last_run_queued?: number
          last_tree_sync_at?: string | null
          lease_until?: string | null
          note?: string | null
          paused_reason?: string | null
          status?: string
          updated_at?: string
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
