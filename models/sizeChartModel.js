import mongoose from 'mongoose';

const sizeChartSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unit: { type: String, enum: ['inch', 'cm'], default: 'inch' },
  sizes: [
    {
      sizeLabel: { type: String, required: true },
      shoulder: Number,
      length: Number,
      chest: Number,
      waist: Number,
      hip: Number,
      sleeve: Number,
      neck: Number,
      thigh: Number,
      // Extend as needed
    },
  ],
  howToMeasureImageUrls: [{ type: String }], // Array of image URLs
  howToMeasureDescription: { type: String, default: '' },
}, { timestamps: true });

const SizeChartModel = mongoose.model('SizeChart', sizeChartSchema);

export default SizeChartModel;
