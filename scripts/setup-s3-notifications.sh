#!/bin/bash

# S3 Event Notifications Setup for ComfyUI
# This script sets up automatic processing of new images uploaded to S3

set -e  # Exit on any error

# Configuration
BUCKET_NAME="mayascott"
REGION="us-east-1"
TOPIC_NAME="comfyui-s3-notifications"
EDGE_FUNCTION_URL="https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/comfyui-s3-processor"

echo "🚀 Setting up S3 event notifications for ComfyUI processing..."
echo "📁 Bucket: $BUCKET_NAME"
echo "🌍 Region: $REGION"
echo "📂 Folder: comfy-generations/"
echo "🔗 Edge Function: $EDGE_FUNCTION_URL"

# Step 1: Create SNS Topic
echo -e "\n📡 Step 1: Creating SNS Topic..."
TOPIC_ARN=$(aws sns create-topic \
  --name $TOPIC_NAME \
  --region $REGION \
  --query 'TopicArn' \
  --output text)

echo "✅ SNS Topic created: $TOPIC_ARN"

# Step 2: Subscribe Edge Function to SNS Topic
echo -e "\n🔗 Step 2: Subscribing Edge Function to SNS Topic..."
SUBSCRIPTION_ARN=$(aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol https \
  --notification-endpoint $EDGE_FUNCTION_URL \
  --region $REGION \
  --query 'SubscriptionArn' \
  --output text)

echo "✅ Subscription created: $SUBSCRIPTION_ARN"

# Step 3: Set SNS Topic Policy to allow S3 to publish
echo -e "\n🔒 Step 3: Setting SNS Topic Policy..."
aws sns set-topic-attributes \
  --topic-arn $TOPIC_ARN \
  --attribute-name Policy \
  --attribute-value '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "s3.amazonaws.com"
        },
        "Action": "SNS:Publish",
        "Resource": "'$TOPIC_ARN'",
        "Condition": {
          "StringEquals": {
            "aws:SourceAccount": "'$(aws sts get-caller-identity --query Account --output text)'"
          }
        }
      }
    ]
  }' \
  --region $REGION

echo "✅ SNS Topic Policy set"

# Step 4: Configure S3 Bucket Notification
echo -e "\n📬 Step 4: Configuring S3 Bucket Notifications..."
aws s3api put-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --notification-configuration '{
    "TopicConfigurations": [
      {
        "Id": "ComfyUIImageProcessor",
        "TopicArn": "'$TOPIC_ARN'",
        "Events": ["s3:ObjectCreated:*"],
        "Filter": {
          "Key": {
            "FilterRules": [
              {
                "Name": "prefix",
                "Value": "comfy-generations/"
              },
              {
                "Name": "suffix",
                "Value": ".png"
              }
            ]
          }
        }
      },
      {
        "Id": "ComfyUIImageProcessorJPG",
        "TopicArn": "'$TOPIC_ARN'",
        "Events": ["s3:ObjectCreated:*"],
        "Filter": {
          "Key": {
            "FilterRules": [
              {
                "Name": "prefix",
                "Value": "comfy-generations/"
              },
              {
                "Name": "suffix",
                "Value": ".jpg"
              }
            ]
          }
        }
      }
    ]
  }'

echo "✅ S3 Bucket Notifications configured"

# Step 5: Verify the configuration
echo -e "\n🔍 Step 5: Verifying configuration..."
aws s3api get-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --output table

echo -e "\n🎉 Setup complete!"
echo -e "\n📋 Summary:"
echo "   • SNS Topic: $TOPIC_ARN"
echo "   • Subscription: $SUBSCRIPTION_ARN"
echo "   • Bucket: $BUCKET_NAME"
echo "   • Triggers on: comfy-generations/*.png and comfy-generations/*.jpg"
echo "   • Sends to: $EDGE_FUNCTION_URL"
echo -e "\n✨ New images uploaded to comfy-generations/ will now be automatically processed!" 