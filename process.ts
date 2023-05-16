import * as fs from "fs"
import * as path from "path"
import { TextLoader } from "langchain/document_loaders/fs/text";
import { loadSummarizationChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { StructuredOutputParser } from "langchain/output_parsers";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { OpenAI } from "langchain/llms/openai";
import { Replicate } from "langchain/llms/replicate";

export const process = async (req, res) => {
    try {
        const data = req.body;    
        const { content } = data   

        const filePath = path.join(__dirname, "data.txt")
        fs.writeFileSync(filePath, content);

        const loader = new TextLoader(filePath);

        const text = await loader.loadAndSplit(
            new RecursiveCharacterTextSplitter({ 
                chunkSize: 500, 
                chunkOverlap: 50,
            })
        )

        const model = new OpenAI({ temperature: 0})
    
        const chain = loadSummarizationChain(model, { type: "map_reduce"})
        const summarized = await chain.call({ input_documents: text })

        console.log({ summarized })

        const template  = 
        `Based on the content please 
            1. extract the animal name 
            2. get one adjective for that animal\n{summarized_text}\n{format_instructions}`

        const parser  = StructuredOutputParser.fromNamesAndDescriptions({
            "Animal name": "animal name",
            "Adjective": "describes the animal"
        })

        const formatInstructions = parser.getFormatInstructions();

        const prompt = new PromptTemplate({
            template,
            inputVariables: ["summarized_text"],
            partialVariables: { format_instructions: formatInstructions}
        });

        const chainA = new LLMChain({ llm: model, prompt })

        const structuredOutput = await chainA.call({summarized_text: summarized.text})

        const parsed = await parser.parse(structuredOutput.text)
        console.log({ structuredOutput: parsed })

        const replicateModel = new Replicate({
            model:
            "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
            input:{image_dimensions: '512x512'}
            });
            const replicateResponse = await replicateModel.call(
                `${parsed.Adjective} ${parsed["Animal name"]}`
            );
            console.log({ replicateResponse });

        res.json({ 
            summarized: summarized.text,
            structuredOutput: parsed,
            replicateResponse  
        })
    } catch(error) {
        console.log({error})
        res
          .status(500)
          .json({ message: "Something went wrong." })
   }
}