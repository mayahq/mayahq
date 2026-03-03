#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SUPABASE_PROJECT_ID="dlaczmexhnoxfggpzxkl"

echo -e "${BLUE}Maya Daily Report Deployment Script${NC}"
echo -e "${BLUE}===============================${NC}\n"

# Apply database migration
echo -e "${BLUE}Applying database migration...${NC}"
supabase db push --project-ref $SUPABASE_PROJECT_ID
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to apply database migration${NC}"
  exit 1
fi
echo -e "${GREEN}Database migration applied successfully${NC}\n"

# Deploy the Edge Function
echo -e "${BLUE}Deploying daily_report Edge Function...${NC}"
supabase functions deploy daily_report --project-ref $SUPABASE_PROJECT_ID
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to deploy Edge Function${NC}"
  exit 1
fi
echo -e "${GREEN}Edge Function deployed successfully${NC}\n"

# Deploy shared CORS module
echo -e "${BLUE}Deploying shared CORS module...${NC}"
supabase functions deploy _shared --project-ref $SUPABASE_PROJECT_ID
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to deploy shared CORS module${NC}"
  exit 1
fi
echo -e "${GREEN}Shared CORS module deployed successfully${NC}\n"

# Set environment variables
echo -e "${BLUE}Setting environment variables...${NC}"
read -p "Enter Anthropic API key: " ANTHROPIC_API_KEY
read -p "Enter OpenAI API key: " OPENAI_API_KEY

supabase secrets set ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY --project-ref $SUPABASE_PROJECT_ID
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to set ANTHROPIC_API_KEY${NC}"
  exit 1
fi

supabase secrets set OPENAI_API_KEY=$OPENAI_API_KEY --project-ref $SUPABASE_PROJECT_ID
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to set OPENAI_API_KEY${NC}"
  exit 1
fi
echo -e "${GREEN}Environment variables set successfully${NC}\n"

# Test the function
echo -e "${BLUE}Testing the function...${NC}"
curl -X POST "https://$SUPABASE_PROJECT_ID.supabase.co/functions/v1/daily_report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"userId":"test-user"}'

echo -e "\n\n${GREEN}Daily report deployment complete!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. Import the n8n workflow template from 'website/scripts/n8n-daily-report-workflow.json'"
echo -e "2. Set up the Discord webhook URL in n8n (if using Discord)"
echo -e "3. Activate the workflow in n8n"
echo -e "\n${GREEN}Done!${NC}" 