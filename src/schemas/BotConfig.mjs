import { Schema } from "mongoose";

const botConfigSchema = new Schema(
  {
    vip_chat_id: {
      type: String,
    },
    preview_chat_id: {
      type: String,
    },
    split_rules: {
      type: Array,
    }
  },
  {
    timestamps: true,
  }
);

export default botConfigSchema;