import mongoose from 'mongoose';

const homeSliderSchema = new mongoose.Schema({
  // For simple image slider (default type)
  imageUrl: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ['simple'],
    default: 'simple'
  },

  order: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for better query performance
homeSliderSchema.index({ order: 1 });
homeSliderSchema.index({ type: 1 });

const SliderModel = mongoose.model('HomeSlider', homeSliderSchema);

export default SliderModel;