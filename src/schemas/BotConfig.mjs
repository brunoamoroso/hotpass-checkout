import { Schema } from "mongoose";

const botConfigSchema = new Schema(
  {
    channel_id: {
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