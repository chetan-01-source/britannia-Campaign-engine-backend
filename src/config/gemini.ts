import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Check if Gemini is available
export const isGeminiAvailable = (): boolean => {
  return !!process.env.GEMINI_API_KEY;
};

// Generate content using Gemini
export const generateGeminiContent = async (prompt: string): Promise<string> => {
  try {
    if (!isGeminiAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Gemini generation failed:', error);
    throw error;
  }
};