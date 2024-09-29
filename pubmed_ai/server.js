const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models/gpt2';

const outcomes = ['myocardial infarction', 'stroke', 'hypertension', 'atherosclerosis', 'heart failure'];
const exposures = ['lead', 'cadmium', 'mercury', 'arsenic', 'aluminum', 'bisphenol A', 'phthalates', 'polycyclic aromatic hydrocarbons'];

function getRandomKeywords() {
  return [
    outcomes[Math.floor(Math.random() * outcomes.length)],
    exposures[Math.floor(Math.random() * exposures.length)]
  ];
}

async function searchPubMed(query) {
  try {
    const response = await axios.get(`${PUBMED_BASE_URL}esearch.fcgi`, {
      params: {
        db: 'pubmed',
        term: query,
        retmax: 5,
        sort: 'relevance',
        format: 'json'
      }
    });
    return response.data.esearchresult.idlist;
  } catch (error) {
    console.error('PubMed API Error:', error);
    return [];
  }
}

async function getCitations(ids) {
  if (!ids || ids.length === 0) return [];
  try {
    const response = await axios.get(`${PUBMED_BASE_URL}esummary.fcgi`, {
      params: {
        db: 'pubmed',
        id: ids.join(','),
        format: 'json'
      }
    });
    return ids.map(id => {
      const article = response.data.result[id];
      return `${article.sortfirstauthor} et al. ${article.title} ${article.fulljournalname}. ${article.pubdate}.`;
    });
  } catch (error) {
    console.error('PubMed Citation Error:', error);
    return [];
  }
}

async function generateResearchIdea(keywords, citations) {
  const prompt = `
    Generate a research idea about the relationship between ${keywords[0]} and ${keywords[1]}.
    Consider the following recent papers:
    ${citations.join('\n')}

    Please provide your response in the following format:
    1. Hypothesis: [State the hypothesis]
    2. Analysis Plan: [Describe the analysis plan]
    3. Expected Results: [Describe the expected results]
    4. Significance: [Describe the significance of the study]
    5. Limitations: [Describe potential limitations of the study]
  `;

  try {
    const openaiResponse = await axios.post(OPENAI_API_URL, {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return openaiResponse.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data || error.message);
    
    // Fallback to Hugging Face
    try {
      const huggingfaceResponse = await axios.post(HUGGINGFACE_API_URL, {
        inputs: prompt,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return huggingfaceResponse.data[0].generated_text;
    } catch (huggingfaceError) {
      console.error('Hugging Face API Error:', huggingfaceError.response?.data || huggingfaceError.message);
      return "Unable to generate research idea. Please try again later.";
    }
  }
}

app.get('/generate-idea', async (req, res) => {
  try {
    const keywords = getRandomKeywords();
    const initialQuery = keywords.join(' AND ');
    const pubmedIds = await searchPubMed(initialQuery);
    const citations = await getCitations(pubmedIds);
    const researchIdea = await generateResearchIdea(keywords, citations);

    res.json({
      keywords,
      citations,
      researchIdea
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while generating the idea.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));