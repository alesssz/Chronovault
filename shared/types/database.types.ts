
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "genres": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"playlist_tracks": {
                  Row: {
                    "playlist_id": string,"position": number,"track_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "playlist_id": string,"position": number,"track_id": string
                  }
                  Update: {
                    "playlist_id"?: string,"position"?: number,"track_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playlist_tracks_playlist_id_fkey"
      columns: ["playlist_id"]
isOneToOne: false
      referencedRelation: "playlists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playlist_tracks_track_id_fkey"
      columns: ["track_id"]
isOneToOne: false
      referencedRelation: "tracks"
      referencedColumns: ["id"]
    }
                  ]
                },"playlists": {
                  Row: {
                    "cover_path": string | null,"created_at": string,"description": string | null,"id": string,"title": string,"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["track_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["track_visibility"]
                  }
                  Update: {
                    "cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["track_visibility"]
                  }
                  Relationships: [
                    
                  ]
                },"tracks": {
                  Row: {
                    "album": string | null,"audio_path": string,"composers": string | null,"cover_path": string | null,"created_at": string,"description": string | null,"duration_seconds": number | null,"genre_id": string | null,"has_lyrics": boolean | null,"has_synced_lyrics": boolean | null,"id": string,"lyrics": string | null,"lyrics_synced": Json | null,"mastered": boolean,"mime_type": string,"peaks": Json | null,"size_bytes": number,"suno_prompt": string | null,"title": string,"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["track_visibility"],"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "album"?: string | null,"audio_path": string,"composers"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"genre_id"?: string | null,"has_lyrics"?: never,"has_synced_lyrics"?: never,"id"?: string,"lyrics"?: string | null,"lyrics_synced"?: Json | null,"mastered"?: boolean,"mime_type": string,"peaks"?: Json | null,"size_bytes": number,"suno_prompt"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["track_visibility"],"year"?: number | null
                  }
                  Update: {
                    "album"?: string | null,"audio_path"?: string,"composers"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"genre_id"?: string | null,"has_lyrics"?: never,"has_synced_lyrics"?: never,"id"?: string,"lyrics"?: string | null,"lyrics_synced"?: Json | null,"mastered"?: boolean,"mime_type"?: string,"peaks"?: Json | null,"size_bytes"?: number,"suno_prompt"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["track_visibility"],"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracks_genre_id_fkey"
      columns: ["genre_id"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "get_shared_playlist":
{ Args: { "p_playlist_id": string }; Returns: {
              "cover_path": string,"description": string,"id": string,"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["track_visibility"]
            }[]
                           },
"get_shared_playlist_tracks":
{ Args: { "p_playlist_id": string }; Returns: {
              "album": string,"audio_path": string,"composers": string,"cover_path": string,"description": string,"duration_seconds": number,"genre": string,"id": string,"lyrics": string,"lyrics_synced": Json,"peaks": Json,"position": number,"title": string,"updated_at": string,"year": number
            }[]
                           },
"get_shared_track":
{ Args: { "p_track_id": string }; Returns: {
              "album": string,"audio_path": string,"composers": string,"cover_path": string,"description": string,"duration_seconds": number,"genre": string,"id": string,"lyrics": string,"lyrics_synced": Json,"peaks": Json,"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["track_visibility"],"year": number
            }[]
                           },
"is_shared_track_file":
{ Args: { "p_bucket": string,"p_path": string }; Returns: boolean
                           },
"owns_playlist":
{ Args: { "p_playlist_id": string }; Returns: boolean
                           },
"set_playlist_tracks":
{ Args: { "p_playlist_id": string,"p_track_ids": (string)[] }; Returns: undefined
                           }
          }
          Enums: {
            "track_visibility": "private"|"unlisted"|"public"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "track_visibility": ["private", "unlisted", "public"]
          }
        }
} as const
