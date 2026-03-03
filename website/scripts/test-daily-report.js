// Test script for daily report functionality
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { format, subDays, startOfDay } = require('date-fns');
const { Configuration, OpenAIApi } = require('openai');

// Initialize OpenAI and Supabase clients
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function generateReport(prompt) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    });
    
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating report:', error.response?.data || error.message);
    return `Error generating report: ${error.message}`;
  }
}

async function testDailyReport() {
  console.log('Testing daily report generation...');
  
  try {
    // Set up date range for report
    const daysBack = 5; // Look back 5 days for more data
    const start = startOfDay(subDays(new Date(), daysBack)).toISOString();
    const reportDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    
    console.log(`Generating report for ${reportDate} with data since ${start}`);
    
    // Get tag definitions
    const { data: tagDefs, error: tagError } = await supabase
      .from('tag_defs')
      .select('slug, description, report_section')
      .eq('is_enabled', true);
      
    if (tagError) {
      console.error('Error fetching tag definitions:', tagError);
      return;
    }
    
    console.log(`Found ${tagDefs.length} tag definitions`);
    
    // Build map of tag slug to report section
    const tagSections = {};
    tagDefs.forEach(tag => {
      tagSections[tag.slug] = tag.report_section;
    });
    
    // Get memories with tags
    const { data: memories, error: memoryError } = await supabase
      .from('maya_memories')
      .select('tags, content, metadata')
      .gte('created_at', start)
      .order('created_at', { ascending: false });
      
    if (memoryError) {
      console.error('Error fetching memories:', memoryError);
      return;
    }
    
    console.log(`Found ${memories.length} memories for the report`);
    
    if (memories.length === 0) {
      console.log('No memories found to generate a report.');
      return;
    }
    
    // Group memories by tag and section
    const grouped = {};
    
    memories.forEach(memory => {
      if (!memory.tags || memory.tags.length === 0) return;
      
      memory.tags.forEach(tag => {
        if (!tagSections[tag]) return;
        
        if (!grouped[tag]) {
          grouped[tag] = {
            section: tagSections[tag],
            memories: []
          };
        }
        
        if (grouped[tag].memories.length < 5) {
          grouped[tag].memories.push(memory.content);
        }
      });
    });
    
    const sections = new Set();
    Object.values(grouped).forEach(g => sections.add(g.section));
    
    console.log(`Report will have ${sections.size} sections: ${Array.from(sections).join(', ')}`);
    
    // Generate prompt
    const prompt = `
You are Maya, Blake's AI assistant. Write a ~300-word daily digest for ${reportDate} broken into these sections:
${Array.from(sections).join(', ')}

For each section, review the relevant tagged memories provided below and summarize key insights, patterns, achievements, or areas for attention.
Use a warm, encouraging tone. Feel free to notice patterns across days if memories indicate them.

Organize your response with clear headings for each section. Make your insights valuable for Blake's reflection.

Tagged Memories:
${Object.entries(grouped).map(([tag, group]) => 
  `[${tag} - ${group.section}]:\n${group.memories.map(m => `- ${m}`).join('\n')}`
).join('\n\n')}
`;

    console.log('\nGenerating report from prompt...');
    const reportContent = await generateReport(prompt);
    
    console.log('\n===== Generated Report =====\n');
    console.log(reportContent);
    console.log('\n===== End of Report =====\n');
    
    // Store the report
    console.log('Storing report in database...');
    const { error: insertError } = await supabase
      .from('daily_reports')
      .insert({
        report_date: reportDate,
        content: reportContent,
        metadata: {
          generated_at: new Date().toISOString(),
          memory_count: memories.length,
          tags: Object.keys(grouped)
        }
      });
      
    if (insertError) {
      console.error('Error storing report:', insertError);
      return;
    }
    
    console.log('Report stored successfully in daily_reports table');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testDailyReport().catch(console.error); 