CREATE TYPE "public"."feature_flag_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."feature_flag_type" AS ENUM('boolean', 'variant');--> statement-breakpoint
CREATE TYPE "public"."flag_rule_operator" AS ENUM('equals', 'in');--> statement-breakpoint
CREATE TYPE "public"."flag_rule_type" AS ENUM('attribute_match', 'percentage_rollout');--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"flag_type" "feature_flag_type" NOT NULL,
	"status" "feature_flag_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_project_id_key_key" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "flag_environment_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_flag_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"default_variant_key" text NOT NULL,
	"projection_version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_environment_configs_feature_flag_id_environment_id_key" UNIQUE("feature_flag_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "flag_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_environment_config_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"rule_type" "flag_rule_type" NOT NULL,
	"attribute_key" text,
	"operator" "flag_rule_operator",
	"comparison_value_json" jsonb,
	"rollout_percentage" integer,
	"variant_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_rules_flag_environment_config_id_sort_order_key" UNIQUE("flag_environment_config_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "flag_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_flag_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"description" text,
	CONSTRAINT "flag_variants_feature_flag_id_key_key" UNIQUE("feature_flag_id","key")
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environment_configs" ADD CONSTRAINT "flag_environment_configs_feature_flag_id_feature_flags_id_fk" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environment_configs" ADD CONSTRAINT "flag_environment_configs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environment_configs" ADD CONSTRAINT "flag_environment_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_rules" ADD CONSTRAINT "flag_rules_flag_environment_config_id_flag_environment_configs_id_fk" FOREIGN KEY ("flag_environment_config_id") REFERENCES "public"."flag_environment_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_variants" ADD CONSTRAINT "flag_variants_feature_flag_id_feature_flags_id_fk" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;