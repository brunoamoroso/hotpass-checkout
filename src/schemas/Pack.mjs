import { Schema } from "mongoose";

const packSchema = new Schema(
  {
    media_preview: {
      type: String,
      required: true,
    },
    media_preview_type: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    content: {
      type: Array,
      required: true,
    },
    status: {
      type: String,
      default: "enabled",
    },
    who_created: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

export default packSchema;
