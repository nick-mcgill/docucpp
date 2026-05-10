/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code2, 
  Sparkles, 
  Copy, 
  Check, 
  Github, 
  GraduationCap, 
  Terminal,
  ArrowRight,
  Info,
  Download,
  Folder,
  FileCode,
  ChevronLeft,
  Search,
  ExternalLink
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from './lib/utils';

// Model configuration
const MODEL_NAME = "gemini-3-flash-preview";

export default function App() {
  const [inputCode, setInputCode] = useState<string>(`#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}`);
  const [outputCode, setOutputCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'workflow' | 'repository'>('editor');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoBranch, setRepoBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>([]);
  const [lastRepoId, setLastRepoId] = useState('');
  const [repoFiles, setRepoFiles] = useState<any[]>([]);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [currentPath, setCurrentPath] = useState('');

  const fetchBranches = async (owner: string, repo: string) => {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`);
      if (response.ok) {
        const data = await response.json();
        const branchNames = data.map((b: any) => b.name);
        setBranches(branchNames);
        return branchNames;
      }
    } catch (e) {
      console.error("Failed to fetch branches", e);
    }
    return [];
  };

  const fetchRepoContents = async (url: string, path = '', overrideBranch?: string) => {
    if (!url.trim()) {
      setError('Please enter a GitHub URL or "owner/repo"');
      return;
    }

    const activeBranch = overrideBranch || repoBranch;

    try {
      setIsLoadingRepo(true);
      setError(null);
      console.log('Fetching repo:', url, 'at path:', path, 'branch:', activeBranch);
      
      // Improved parser for various GitHub URL formats
      let owner = '';
      let repo = '';
      
      const cleanUrl = url.trim().replace(/\/$/, ''); // Remove trailing slash
      const githubMatch = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      
      if (githubMatch) {
        owner = githubMatch[1];
        repo = githubMatch[2];
        // Handle cases like owner/repo/tree/branch or owner/repo/blob/branch
        if (repo.includes('/')) {
          repo = repo.split('/')[0];
        }
      } else {
        const parts = cleanUrl.split('/');
        if (parts.length === 2 && parts[0] && parts[1]) {
          [owner, repo] = parts;
        } else {
          throw new Error('Please provide a full GitHub URL (e.g., https://github.com/owner/repo) or "owner/repo"');
        }
      }
      
      // Fetch branches if this is a new repository or we haven't loaded them
      const repoId = `${owner}/${repo}`;
      if (repoId !== lastRepoId) {
        setLastRepoId(repoId);
        const fetchedBranches = await fetchBranches(owner, repo);
        
        let initialBranch = activeBranch;
        // If we found branches and current activeBranch isn't in them, update it
        if (fetchedBranches.length > 0 && !fetchedBranches.includes(activeBranch)) {
          if (fetchedBranches.includes('main')) initialBranch = 'main';
          else if (fetchedBranches.includes('master')) initialBranch = 'master';
          else initialBranch = fetchedBranches[0];
          
          setRepoBranch(initialBranch);
        }
        
        // If we updated the branch, we MUST use the new one for the API call below
        const finalBranch = initialBranch;
        const cleanPath = path ? `/${path}` : '';
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${cleanPath}${finalBranch ? `?ref=${finalBranch}` : ''}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        const files = Array.isArray(data) ? data : [data];
        setRepoFiles(files);
        setCurrentPath(path);
        return;
      }

      const cleanPath = path ? `/${path}` : '';
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${cleanPath}${activeBranch ? `?ref=${activeBranch}` : ''}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        let errorMessage = 'Failed to fetch repository contents';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // Fallback if response isn't JSON
          errorMessage = `HTTP Error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      const files = Array.isArray(data) ? data : [data];
      setRepoFiles(files);
      setCurrentPath(path);
      console.log('Successfully fetched', files.length, 'items');
    } catch (err) {
      console.error('DocuCpp Repo Error:', err);
      setError(err instanceof Error ? err.message : 'Error accessing repository. It might be private or doesn\'t exist.');
    } finally {
      setIsLoadingRepo(false);
    }
  };

  const [repoOutput, setRepoOutput] = useState<string>('');
  const [isRepoGenerating, setIsRepoGenerating] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDocs = async (code: string, isRepoView = false) => {
    const setLoadingState = isRepoView ? setIsRepoGenerating : setIsGenerating;
    const setOutputState = isRepoView ? setRepoOutput : setOutputCode;

    setLoadingState(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [{
              text: `You are an expert C++ developer who specializes in teaching high school students.
Your task is to take the following C++ code and:
1. Add Doxygen documentation for all functions, classes, and variables.
2. Add clear, concise comments within the code.
3. CRITICAL: The language used in comments and documentation MUST be clear, concise, and avoid overly technical jargon. It should be understandable by a 10th-grade student.
4. Explanations should focus on "what" and "why" in simple terms.
5. MANDATORY: Every documentation block (Doxygen) and code comment you add MUST start with the exact prefix "AI explanation: ". For example: "// AI explanation: [comment content]" or "/** AI explanation: [doxygen content] */".
6. Return ONLY the code with the added comments. Do not include any markdown formatting outside of the code block.

CODE TO PROCESS:
${code}`
            }]
          }
        ],
        config: {
          temperature: 0.7,
        }
      });

      const result = response.text || '';
      const cleanedResult = result.replace(/^```(cpp|c\+\+)?\n/, '').replace(/\n```$/, '');
      setOutputState(cleanedResult);
    } catch (err) {
      console.error(err);
      setError('Failed to generate documentation. Please check your API key and try again.');
    } finally {
      setLoadingState(false);
    }
  };

  const handleGenerate = () => generateDocs(inputCode);

  const handleFileSelect = async (file: any) => {
    if (file.type === 'dir') {
      fetchRepoContents(repoUrl, file.path);
      return;
    }
    
    try {
      setIsRepoGenerating(true);
      setSelectedFileName(file.name);
      setRepoOutput('');
      const response = await fetch(file.download_url);
      const content = await response.text();
      setInputCode(content); // Sync with editor
      await generateDocs(content, true);
    } catch (err) {
      setError('Failed to fetch file content');
    } finally {
      setIsRepoGenerating(false);
    }
  };

  const handleBack = () => {
    const parts = currentPath.split('/');
    parts.pop();
    fetchRepoContents(repoUrl, parts.join('/'));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const workflowYaml = `name: Recursive DocuCpp Commenter
on:
  workflow_dispatch:
    inputs:
      repository:
        description: 'Repo to document (owner/repo)'
        required: true
        default: 'username/repo'
      branch:
        description: 'Branch name'
        required: true
        default: 'main'

jobs:
  document:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: \${{ github.event.inputs.repository }}
          ref: \${{ github.event.inputs.branch }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install Dependencies
        run: npm install @google/genai glob
        
      - name: Run Recursive Documenter
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
        run: |
          cat << 'EOF' > docucpp_runner.js
          const { GoogleGenAI } = require("@google/genai");
          const fs = require("fs");
          const { globSync } = require("glob");

          async function processFiles() {
            const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
            const files = globSync("**/*.{cpp,h,hpp,cc,cxx}", { ignore: "node_modules/**" });

            for (const file of files) {
              console.log("Processing: " + file);
              const content = fs.readFileSync(file, "utf8");
              const prompt = "Expert C++ documentation task: " + content;
              const result = await model.generateContent(prompt);
              const text = result.response.text().replace(/^' ' ' (cpp|c\\\\+\\\\+)?\\\\n/, '').replace(/\\\\n' ' '$/, '');
              fs.writeFileSync(file, text);
            }
          }
          processFiles();
          EOF
          node docucpp_runner.js

      - name: Archive Results
        run: zip -r documented_repo.zip . -x "*.git*" "node_modules/*"

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: documented-repo
          path: documented_repo.zip`;

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-bottom border-[#141414] border-b p-6 flex justify-between items-center bg-[#E4E3E0] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-[#141414] p-2 rounded-sm text-[#E4E3E0]">
            <Code2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">DocuCpp</h1>
            <p className="font-serif italic text-xs opacity-60">High School Friendly Doxygen Generator</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('editor')}
            className={cn(
              "px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all",
              activeTab === 'editor' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-white/50"
            )}
          >
            Editor
          </button>
          <button 
            onClick={() => setActiveTab('repository')}
            className={cn(
              "px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all",
              activeTab === 'repository' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-white/50"
            )}
          >
            Repository
          </button>
          <button 
            onClick={() => setActiveTab('workflow')}
            className={cn(
              "px-4 py-2 text-xs font-mono uppercase tracking-widest transition-all",
              activeTab === 'workflow' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-white/50"
            )}
          >
            Workflow
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'editor' ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-180px)]"
            >
              {/* Input Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#141414]/60">
                    <Terminal size={16} />
                    <span className="font-mono text-[10px] uppercase tracking-widest">Input C++ Code</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GraduationCap size={16} className="text-[#141414]/60" />
                    <span className="font-serif italic text-xs">High School Level Enabled</span>
                  </div>
                </div>
                
                <div className="relative flex-1 group">
                  <textarea
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="w-full h-full bg-white border border-[#141414] p-6 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all placeholder:text-[#141414]/20"
                    placeholder="Paste your C++ code here..."
                  />
                  <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="bg-[#141414] text-[#E4E3E0] px-6 py-3 rounded-sm flex items-center gap-2 text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#E4E3E0] border-t-transparent" />
                      ) : (
                        <Sparkles size={18} />
                      )}
                      {isGenerating ? 'ANALYZING...' : 'GENERATE DOCS'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Output Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#141414]/60">
                    <Sparkles size={16} />
                    <span className="font-mono text-[10px] uppercase tracking-widest">Processed Code</span>
                  </div>
                  {outputCode && (
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const blob = new Blob([outputCode], { type: 'text/x-c++src' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'documented_code.cpp';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono hover:underline uppercase"
                      >
                        <Download size={12} />
                        Download .cpp
                      </button>
                      <button 
                        onClick={() => handleCopy(outputCode)}
                        className="flex items-center gap-1 text-[10px] font-mono hover:underline uppercase"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy Code'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-[#151718] border border-[#141414] overflow-auto relative">
                  {!outputCode && !isGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                      <div className="mb-4">
                        <ArrowRight size={48} strokeWidth={1} />
                      </div>
                      <p className="font-serif italic text-lg text-white">Your documented code will appear here after clicking generate.</p>
                      <p className="text-xs font-mono mt-2 text-white/60">Powered by Gemini AI • Student Friendly Mode</p>
                    </div>
                  ) : isGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 space-y-4">
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.1, 1],
                            opacity: [0.5, 1, 0.5]
                          }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="bg-white/10 p-4 rounded-full"
                        >
                          <GraduationCap size={40} className="text-white" />
                        </motion.div>
                        <p className="text-white font-mono text-sm animate-pulse tracking-widest">TRANSLATING JARGON TO PLAIN ENGLISH...</p>
                    </div>
                  ) : (
                    <SyntaxHighlighter
                      language="cpp"
                      style={tomorrow}
                      customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        height: '100%',
                        backgroundColor: 'transparent',
                        fontSize: '0.875rem',
                      }}
                    >
                      {outputCode}
                    </SyntaxHighlighter>
                  )}
                  {error && (
                    <div className="absolute top-4 left-4 right-4 bg-red-900/90 text-white p-3 text-xs font-mono border border-red-500">
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'repository' ? (
            <motion.div 
              key="repository"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:h-[calc(100vh-200px)] h-auto pb-20 lg:pb-0"
            >
              {/* Repository Column */}
              <div className="bg-white border border-[#141414] flex flex-col overflow-hidden lg:h-full h-[400px]">
                <div className="p-4 border-b border-[#141414] bg-[#141414] text-[#E4E3E0] flex items-center gap-2">
                  <Github size={18} />
                  <span className="font-mono text-[10px] uppercase tracking-widest">Repository Explorer</span>
                </div>
                
                <div className="p-4 bg-[#E4E3E0]/50 border-b border-[#141414] space-y-2">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          fetchRepoContents(repoUrl);
                        }
                      }}
                      placeholder="username/repo"
                      className="flex-1 bg-white border border-[#141414] px-3 py-2 font-mono text-xs focus:outline-none"
                    />
                    <button 
                      onClick={() => fetchRepoContents(repoUrl)}
                      disabled={isLoadingRepo}
                      className="bg-[#141414] text-[#E4E3E0] px-3 py-2 flex items-center justify-center"
                    >
                      {isLoadingRepo ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-[#E4E3E0] border-t-transparent" /> : <Search size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">Branch:</span>
                    <select 
                      value={repoBranch}
                      onChange={(e) => {
                        const newBranch = e.target.value;
                        setRepoBranch(newBranch);
                        // Refetch contents for the new branch if we have a repo loaded
                        if (lastRepoId) {
                          fetchRepoContents(repoUrl, currentPath, newBranch);
                        }
                      }}
                      className="flex-1 bg-white/50 border border-[#141414]/20 px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-[#141414] appearance-none cursor-pointer"
                    >
                      {branches.length > 0 ? (
                        branches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))
                      ) : (
                        <option value={repoBranch}>{repoBranch}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  {currentPath && (
                    <button 
                      onClick={handleBack}
                      className="w-full p-3 border-b border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] flex items-center gap-2 text-[10px] font-mono transition-colors sticky top-0 bg-white"
                    >
                      <ChevronLeft size={14} />
                      BACK TO .. / {currentPath}
                    </button>
                  )}
                  
                  {isLoadingRepo ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-1 bg-[#141414] animate-[width_1s_ease-in-out_infinite]" />
                        <span className="font-mono text-[10px] uppercase tracking-widest">Indexing contents...</span>
                      </div>
                    </div>
                  ) : repoFiles.length > 0 ? (
                    <div className="divide-y divide-[#141414]/10">
                      {repoFiles.map((file) => {
                        const isCpp = /\.(cpp|h|hpp|cc|cxx)$/.test(file.name);
                        return (
                          <div 
                            key={file.sha}
                            onClick={() => handleFileSelect(file)}
                            className={cn(
                              "p-3 flex items-center justify-between group cursor-pointer transition-colors",
                              file.type === 'dir' ? "hover:bg-[#141414]/5" : isCpp ? "hover:bg-[#141414]/5" : "opacity-30 cursor-not-allowed"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {file.type === 'dir' ? (
                                <Folder className="text-[#141414] shrink-0" size={16} />
                              ) : (
                                <FileCode className={isCpp ? "text-[#141414] shrink-0" : "text-[#141414]/40 shrink-0"} size={16} />
                              )}
                              <span className="text-[11px] font-mono truncate">{file.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : !isLoadingRepo && (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                      <Github size={32} strokeWidth={1} className="mb-2" />
                      <p className="text-[10px] uppercase font-mono tracking-widest">Enter URL to browse</p>
                    </div>
                  )}
                </div>
                {error && (
                  <div className="p-3 bg-red-900 text-white text-[10px] font-mono border-t border-[#141414]">
                    {error}
                  </div>
                )}
              </div>

              {/* Output Preview Column (Span 2) */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#141414]/60">
                    <Sparkles size={16} />
                    <span className="font-mono text-[10px] uppercase tracking-widest">
                      {selectedFileName ? `Processing: ${selectedFileName}` : 'Select a file to document'}
                    </span>
                  </div>
                  {repoOutput && (
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const blob = new Blob([repoOutput], { type: 'text/x-c++src' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `documented_${selectedFileName || 'code.cpp'}`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono hover:underline uppercase"
                      >
                        <Download size={12} />
                        Download
                      </button>
                      <button 
                        onClick={() => handleCopy(repoOutput)}
                        className="flex items-center gap-1 text-[10px] font-mono hover:underline uppercase"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-[#151718] border border-[#141414] overflow-auto relative min-h-[500px] lg:min-h-0">
                  {isRepoGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 space-y-4">
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.1, 1],
                            opacity: [0.5, 1, 0.5]
                          }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="bg-white/10 p-4 rounded-full"
                        >
                          <GraduationCap size={40} className="text-white" />
                        </motion.div>
                        <p className="text-white font-mono text-[10px] animate-pulse tracking-widest uppercase">Documenting with AI...</p>
                    </div>
                  ) : repoOutput ? (
                    <SyntaxHighlighter
                      language="cpp"
                      style={tomorrow}
                      customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        height: '100%',
                        backgroundColor: 'transparent',
                        fontSize: '0.875rem',
                      }}
                    >
                      {repoOutput}
                    </SyntaxHighlighter>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                      <div className="mb-4 text-white">
                        <FileCode size={48} strokeWidth={1} />
                      </div>
                      <p className="font-serif italic text-lg text-white">DocuCpp will generate documentation here.</p>
                      <p className="text-xs font-mono mt-2 text-white/60 uppercase tracking-widest">Select a .cpp or .h file</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="workflow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-8 pb-12"
            >
              <section className="bg-white border border-[#141414] p-8 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Terminal size={24} />
                  <h2 className="text-2xl font-bold tracking-tight uppercase">Bulk Documentation Workflow</h2>
                </div>
                <p className="font-serif italic text-[#141414]/70">
                  Want to document an entire repository at once? You can use GitHub Actions to recursively process all C++ files and generate a ZIP archive.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <div className="bg-[#141414] text-white w-5 h-5 flex items-center justify-center text-[10px]">1</div>
                        Action Config
                      </h3>
                      <p className="text-xs opacity-70">
                        This workflow uses <code className="bg-black/5 px-1">workflow_dispatch</code>, allowing you to manually trigger it and provide a target repository and branch as parameters.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <div className="bg-[#141414] text-white w-5 h-5 flex items-center justify-center text-[10px]">2</div>
                        Recursive Scripting
                      </h3>
                      <p className="text-xs opacity-70">
                        The workflow creates a temporary Node.js script that uses the <code className="bg-black/5 px-1">glob</code> package to find all <code className="bg-black/5 px-1">.cpp</code> and <code className="bg-black/5 px-1">.h</code> files, then iterates through them with Gemini AI.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <div className="bg-[#141414] text-white w-5 h-5 flex items-center justify-center text-[10px]">3</div>
                        ZIP & Artifacts
                      </h3>
                      <p className="text-xs opacity-70">
                        Finally, it packages the modified files into a ZIP archive and uploads it as a GitHub Artifact, which you can download directly from the Actions run.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-[10px] uppercase tracking-widest opacity-60">Workflow YAML</h3>
                      <button 
                        onClick={() => handleCopy(workflowYaml)}
                        className="text-[10px] font-mono hover:underline uppercase flex items-center gap-1"
                      >
                       {copied ? <Check size={12} /> : <Copy size={12} />}
                       {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="bg-[#151718] text-white p-4 overflow-auto text-[11px] h-[300px] border border-[#141414] font-mono">
                      <pre><code>{workflowYaml}</code></pre>
                    </div>
                  </div>
                </div>

                <div className="bg-[#141414] text-[#E4E3E0] p-6 flex gap-4 items-start">
                  <Info className="flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-bold uppercase tracking-wider">Setup Requirements</p>
                    <ul className="text-xs opacity-80 space-y-1 list-disc pl-4">
                      <li>Add <code className="bg-white/10 px-1">GEMINI_API_KEY</code> to your repository secrets.</li>
                      <li>Ensuring the runner has permissions to write to the repository if you want to commit back (optional).</li>
                      <li>Adjust the prompt in the script to match your desired documentation style.</li>
                    </ul>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-1 bg-[#141414]" />
    </div>
  );
}

