import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  // Check for POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API Key Authentication: Accept both x-api-key and x-rapidapi-key
 const isRapidAPI = !!req.headers['x-rapidapi-proxy-secret'] || !!req.headers['x-rapidapi-host'];
const clientKey = req.headers['x-api-key'] || req.headers['x-rapidapi-key'];

// Allow all RapidAPI traffic, but require CLIENT_API_KEY for direct calls
if (!isRapidAPI && process.env.CLIENT_API_KEY && clientKey !== process.env.CLIENT_API_KEY) {
  return res.status(403).json({ error: 'Unauthorized' });
}


  const { content, format = 'abstract' } = req.body;
  const allowedFormats = ['abstract', 'linkedin_post', 'twitter_thread'];

  if (!content || !allowedFormats.includes(format)) {
    return res.status(400).json({ error: `content and format (${allowedFormats.join(', ')}) are required` });
  }

  // Refined Prompt Templates
  const prompts = {
    abstract: `
You are an AI summarizer that condenses lengthy documents into clear, concise, and accurate summaries, keeping only the most important details.

- Maintain neutrality and objectivity.
- Ensure readability, with a tone suitable for business professionals.
- Remove any redundant information.
- Do not add labels like "Summary:" or any markdown.

Text to summarize:
"""${content}"""
`,
    linkedin_post: `
You are a professional LinkedIn content writer. Create a LinkedIn post summarizing the following content.

- Begin with an attention-grabbing headline.
- Write 2-3 paragraphs that highlight key points.
- End with a call to action or thought-provoking conclusion.
- Write in a professional, engaging tone.
- Use relevant hashtags at the end.

Format like this example:
"""
The Growing Importance of Automatic Summarization in the Age of Information Overload

With the increasing volume of digital content, summarization tools have become essential. These systems use advanced AI to distill long documents into concise, actionable insights—saving time for busy professionals.

Automatic summarization plays a critical role in everything from search engines to research tools, ensuring that the most important information is always accessible in a fraction of the time.

#AI #MachineLearning #Summarization #BusinessEfficiency #InformationOverload
"""

Text to summarize:
"""${content}"""
`,
    twitter_thread: `
You are a Twitter content creator. Write a Twitter thread summarizing the following content.

- Break it into 3-4 tweets.
- Number the tweets sequentially (e.g., 1/4, 2/4, etc.).
- Add relevant emojis to make the thread more engaging.
- Ensure each tweet is concise and easy to understand.

Format like this example:
"""
{
  "twitter_thread": [
    "1/ Summarization tools are transforming how we digest vast amounts of information. 🧠📚",
    "2/ With AI, we can condense long articles into bite-sized summaries that retain key points. 🔑💡",
    "3/ From research to business intelligence, AI summarization is becoming indispensable in many fields. 🔍📊"
  ]
}
"""

Text to summarize:
"""${content}"""
`,
  };

  try {
    const prompt = prompts[format];
    const model = 'gemini-1.5-flash-8b';
    const config = { responseMimeType: 'text/plain' };
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    // Fetching the response from the AI model
    const response = await ai.models.generateContentStream({ model, config, contents });

    let result = '';
    for await (const chunk of response) {
      result += chunk.text;
    }

    // Post-processing: Clean up the AI response
    const cleaned = result
      .replace(/^(\*\*?Summary:?\*\*?|\*Summary:|\s*Summary:)\s*/i, '') // remove 'Summary:' label
      .replace(/```json\n?/g, '') // strip code blocks
      .replace(/```/g, '') // remove any extra code block markers
      .trim();

    // Handling Twitter Thread format
    if (format === 'twitter_thread') {
      try {
        const parsed = JSON.parse(cleaned); // Parsing JSON response for Twitter thread
        return res.status(200).json({ summaries: parsed });
      } catch (e) {
        return res.status(500).json({ error: 'Invalid JSON from AI', raw: cleaned });
      }
    } else {
      return res.status(200).json({
        summaries: {
          [format]: cleaned,
        },
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
