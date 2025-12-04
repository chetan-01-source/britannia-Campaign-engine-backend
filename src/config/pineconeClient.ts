import { Pinecone } from "@pinecone-database/pinecone";
import fetch, { Headers, Request, Response } from "node-fetch";
import { FormData } from "formdata-node";
import dotenv from "dotenv";

dotenv.config();

// Make fetch and related APIs available globally for Pinecone
global.fetch = fetch as any;
global.Headers = Headers as any;
global.Request = Request as any;
global.Response = Response as any;
global.FormData = FormData as any;

export const pinecone = new Pinecone({
   apiKey: process.env.PINECONE_API_KEY!,
});

export const index = pinecone.Index(process.env.PINECONE_INDEX!);