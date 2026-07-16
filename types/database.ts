export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity_history: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
          workspace_id: string | null;
          workspace_name: string | null;
          workspace_slug: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          workspace_id?: string | null;
          workspace_name?: string | null;
          workspace_slug?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          new_values?: Json | null;
          old_values?: Json | null;
          workspace_id?: string | null;
          workspace_name?: string | null;
          workspace_slug?: string | null;
        };
        Relationships: [];
      };
      workspace_identity_registry: {
        Row: {
          name: string;
          slug: string;
          workspace_id: string;
        };
        Insert: {
          name: string;
          slug: string;
          workspace_id: string;
        };
        Update: {
          name?: string;
          slug?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          auth_user_id: string;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          display_name: string;
          email: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          updated_at: string;
          work_item_id: string;
        };
        Insert: {
          author_name: string;
          body: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          work_item_id: string;
        };
        Update: {
          author_name?: string;
          body?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          work_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      statuses: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          reporting_category: string;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color: string;
          created_at?: string;
          id?: string;
          name: string;
          reporting_category: string;
          sort_order: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          reporting_category?: string;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statuses_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      work_items: {
        Row: {
          assignee: string | null;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          parent_id: string | null;
          priority: string;
          progress: number;
          sort_order: number;
          start_date: string | null;
          status_id: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          assignee?: string | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          parent_id?: string | null;
          priority?: string;
          progress?: number;
          sort_order?: number;
          start_date?: string | null;
          status_id: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assignee?: string | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          parent_id?: string | null;
          priority?: string;
          progress?: number;
          sort_order?: number;
          start_date?: string | null;
          status_id?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_items_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "work_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_items_workspace_id_status_id_fkey";
            columns: ["workspace_id", "status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      audit_dashboard_mutation: { Args: Record<PropertyKey, never>; Returns: unknown };
      check_work_item_hierarchy: { Args: Record<PropertyKey, never>; Returns: unknown };
      create_status: {
        Args: {
          p_color: string;
          p_name: string;
          p_reporting_category: string;
          p_status_id: string;
          p_workspace_id: string;
        };
        Returns: Database["public"]["Tables"]["statuses"]["Row"];
      };
      delete_work_item_comments_for_audit: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      lock_work_item_root_membership: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      list_history_actors: {
        Args: { p_workspace_slug: string };
        Returns: Array<{
          actor_id: string;
          display_name: string;
          email: string | null;
        }>;
      };
      query_activity_history: {
        Args: {
          p_action?: string | null;
          p_actor_id?: string | null;
          p_entity_type?: string | null;
          p_from_date?: string | null;
          p_page?: number;
          p_page_size?: number;
          p_snapshot_at?: string | null;
          p_to_date?: string | null;
          p_workspace_slug: string;
        };
        Returns: Array<{
          action: string;
          actor_display_name: string | null;
          actor_email: string | null;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_values: Json | null;
          old_values: Json | null;
          snapshot_at: string;
          total_count: number;
          workspace_id: string | null;
          workspace_name: string | null;
          workspace_slug: string | null;
        }>;
      };
      resolve_history_workspace: {
        Args: { p_workspace_slug: string };
        Returns: Array<{
          is_deleted: boolean;
          name: string;
          slug: string;
          workspace_id: string;
        }>;
      };
      reorder_work_items: {
        Args: {
          p_ordered_item_ids: string[];
          p_parent_id: string | null;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      reorder_statuses: {
        Args: {
          p_ordered_status_ids: string[];
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      replace_and_delete_status: {
        Args: {
          p_expected_updated_at: string;
          p_replacement_status_id: string;
          p_source_status_id: string;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      set_updated_at: { Args: Record<PropertyKey, never>; Returns: unknown };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;
