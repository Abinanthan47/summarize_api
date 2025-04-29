import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content, format = 'abstract' } = req.body;
  const allowedFormats = ['abstract', 'linkedin_post', 'twitter_thread'];

  if (!content || !allowedFormats.includes(format)) {
    return res.status(400).json({ error: `content and format (${allowedFormats.join(', ')}) are required` });
  }

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

Text to summarize:
"""${content}"""
`,
    twitter_thread: `
You are a Twitter content creator. Write a Twitter thread summarizing the following content.

- Break it into 3-4 tweets.
- Number the tweets sequentially (e.g., 1/4, 2/4, etc.).
- Add relevant emojis to make the thread more engaging.
- Ensure each tweet is concise and easy to understand.
- Format your response as plain text with each tweet on its own paragraph.

Text to summarize:
"""${content}"""
`
  };

  try {
    const prompt = prompts[format];
    const model = 'gemini-1.5-flash-8b';
    const config = { responseMimeType: 'text/plain' };
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    const response = await ai.models.generateContentStream({ model, config, contents });

    let result = '';
    for await (const chunk of response) {
      result += chunk.text;
    }

    const cleaned = result
      .replace(/^(\*\*?Summary:?\*\*?|\*Summary:|\s*Summary:)\s*/i, '')
      .replace(/```json\n?/g, '')
      .replace(/```/g, '')
      .trim();

    if (format === 'twitter_thread') {
      try {
        // First try to parse as JSON
        const parsed = JSON.parse(cleaned);
        return res.status(200).json({ 
          summaries: {
            twitter_thread: parsed.twitter_thread || parsed
          }
        });
      } catch (e) {
        // If JSON parsing fails, try to parse as plain text thread
        
        // Split by double newlines to get paragraphs
        let tweets = cleaned.split(/\n{2,}/).filter(t => t.trim().length > 0);
        
        // If that doesn't work well, try splitting by numbered pattern
        if (tweets.length <= 1) {
          // Try to extract numbered tweets with regex
          const tweetRegex = /(\d+\/\d+.+?)(?=\n*\d+\/\d+|$)/gs;
          const matches = [...cleaned.matchAll(tweetRegex)];
          
          if (matches.length > 0) {
            tweets = matches.map(match => match[0].trim());
          } else {
            // Last resort: just split by newlines
            tweets = cleaned.split('\n').filter(t => t.trim().length > 0);
          }
        }
        
        return res.status(200).json({
          summaries: {
            twitter_thread: tweets
          }
        });
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
