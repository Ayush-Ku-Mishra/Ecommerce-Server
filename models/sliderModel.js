import mongoose from 'mongoose';

const homeSliderSchema = new mongoose.Schema({
  // For simple image slider (type 'simple')
  imageUrl: {
    type: String,
    required: function() { return this.type === 'simple'; }
  },

  // For complex banner slides (type 'banner')
  bannerImage: {
    type: String,
    required: function() { return this.type === 'banner'; }
  },
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  price: {
    type: String,
    default: ''
  },
  link: {
    type: String,
    default: ''
  },

  type: {
    type: String,
    enum: ['simple', 'banner'],
    required: true
  },

  order: {
    type: Number,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for better query performance
homeSliderSchema.index({ isActive: 1, order: 1 });
homeSliderSchema.index({ type: 1 });

const SliderModel = mongoose.model('HomeSlider', homeSliderSchema);

export default SliderModel;