#!/bin/bash

# Firebase Storage CORS Setup Script
# This script helps configure CORS for Firebase Storage to fix image loading issues

echo "🔥 Setting up Firebase Storage CORS configuration..."

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "❌ gsutil not found. Please install Google Cloud SDK:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if firebase-storage-cors.json exists
if [ ! -f "firebase-storage-cors.json" ]; then
    echo "❌ firebase-storage-cors.json not found in current directory"
    exit 1
fi

# Set the storage bucket (update this to match your Firebase project)
STORAGE_BUCKET="our-daily.firebasestorage.app"

echo "📦 Configuring CORS for bucket: $STORAGE_BUCKET"

# Apply CORS configuration
gsutil cors set firebase-storage-cors.json gs://$STORAGE_BUCKET

if [ $? -eq 0 ]; then
    echo "✅ CORS configuration applied successfully!"
    echo "🔄 Changes may take a few minutes to propagate."
    echo ""
    echo "📋 To verify the configuration, run:"
    echo "   gsutil cors get gs://$STORAGE_BUCKET"
else
    echo "❌ Failed to apply CORS configuration"
    echo "💡 Make sure you're authenticated with gcloud:"
    echo "   gcloud auth login"
    echo "   gcloud config set project our-daily"
fi
