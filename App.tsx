
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Page, PageStatus } from './types';
import { extractTextFromImage } from './services/geminiService';
import { UploadIcon, SpinnerIcon, CheckCircleIcon, XCircleIcon, ReloadIcon } from './components/Icons';

// Configure the worker for pdf.js
declare const pdfjsLib: any;
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

const App: React.FC = () => {
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<string>('');

  const handlePdfFile = async (pdfFile: File | null) => {
    if (!pdfFile || pdfFile.type !== 'application/pdf') {
      alert("Please upload a valid PDF file.");
      return;
    }

    setPages([]);
    setSelectedPages(new Set());
    setIsPdfLoading(true);
    setCopySuccess('');

    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        const pagePromises = Array.from({ length: pdf.numPages }, async (_, i) => {
            const pageNum = i + 1;
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) return null;

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
            const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

            if (!blob) return null;
            
            const file = new File([blob], `page_${pageNum}.jpg`, { type: 'image/jpeg' });
            
            const newPage: Page = {
                id: crypto.randomUUID(),
                file,
                status: PageStatus.PENDING,
                previewUrl,
            };
            return newPage;
        });

        const newPages = (await Promise.all(pagePromises)).filter((p): p is Page => p !== null);
        setPages(newPages);

    } catch (error) {
        console.error("Error loading PDF:", error);
        alert("There was an error processing the PDF. Please ensure it's a valid file.");
    } finally {
        setIsPdfLoading(false);
    }
  };


  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePdfFile(e.dataTransfer.files[0]);
    }
  };

  const processSelectedPages = useCallback(async () => {
    if (selectedPages.size === 0) return;
    setIsProcessing(true);

    const pagesToProcess = pages.filter(p => selectedPages.has(p.id));

    const processingPromises = pagesToProcess.map(async (page) => {
      if (page.status !== PageStatus.PENDING && page.status !== PageStatus.FAILED) return;

      setPages(prev => prev.map(p => 
        p.id === page.id ? { ...p, status: PageStatus.PROCESSING } : p
      ));

      try {
        const text = await extractTextFromImage(page);
        setPages(prev => prev.map(p =>
          p.id === page.id ? { ...p, status: PageStatus.COMPLETED, text } : p
        ));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setPages(prev => prev.map(p =>
          p.id === page.id ? { ...p, status: PageStatus.FAILED, error: errorMessage } : p
        ));
      }
    });
    
    await Promise.all(processingPromises);

    setSelectedPages(new Set());
    setIsProcessing(false);
  }, [pages, selectedPages]);

  const retryPageProcessing = useCallback(async (pageId: string) => {
    const pageToRetry = pages.find(p => p.id === pageId);
    if (!pageToRetry || isProcessing) return;

    // Temporarily add to selection and process
    const tempSelection = new Set([pageId]);
    setIsProcessing(true);

    setPages(prev => prev.map(p => 
      p.id === pageId ? { ...p, status: PageStatus.PROCESSING, error: undefined } : p
    ));

    try {
      const text = await extractTextFromImage(pageToRetry);
      setPages(prev => prev.map(p =>
        p.id === pageId ? { ...p, status: PageStatus.COMPLETED, text } : p
      ));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setPages(prev => prev.map(p =>
        p.id === pageId ? { ...p, status: PageStatus.FAILED, error: errorMessage } : p
      ));
    }

    setIsProcessing(false);
  }, [pages, isProcessing]);

  const handleToggleSelectPage = (pageId: string) => {
    setSelectedPages(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(pageId)) {
        newSelection.delete(pageId);
      } else {
        newSelection.add(pageId);
      }
      return newSelection;
    });
  };

  const processablePageIds = useMemo(() => 
    pages.filter(p => p.status === PageStatus.PENDING || p.status === PageStatus.FAILED).map(p => p.id),
    [pages]
  );

  const allProcessableSelected = useMemo(() => 
    processablePageIds.length > 0 && processablePageIds.every(id => selectedPages.has(id)),
    [processablePageIds, selectedPages]
  );
  
  const handleSelectAll = () => {
    if (allProcessableSelected) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(processablePageIds));
    }
  };

  const completedPages = useMemo(() => pages.filter(p => p.status === PageStatus.COMPLETED), [pages]);

  const allPagesDone = useMemo(() => {
    if (pages.length === 0) return false;
    return pages.every(p => p.status === PageStatus.COMPLETED || p.status === PageStatus.FAILED);
  }, [pages]);

  const combinedText = useMemo(() => {
    return pages
      .filter(p => p.status === PageStatus.COMPLETED && p.text)
      .map((p, index) => {
        const originalIndex = pages.findIndex(originalPage => originalPage.id === p.id);
        return `--- পৃষ্ঠা ${originalIndex + 1} ---\n\n${p.text}`
      })
      .join('\n\n');
  }, [pages]);

  const copyToClipboard = () => {
    if (!combinedText) return;
    navigator.clipboard.writeText(combinedText).then(() => {
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    }, (err) => {
      setCopySuccess('Failed to copy!');
      console.error('Could not copy text: ', err);
      setTimeout(() => setCopySuccess(''), 2000);
    });
  };
  
  const progress = useMemo(() => {
    if (pages.length === 0) return 0;
    const finished = pages.filter(p => p.status === PageStatus.COMPLETED || p.status === PageStatus.FAILED).length;
    return (finished / pages.length) * 100;
  }, [pages]);
  
  const getStatusBorderColor = (status: PageStatus) => {
    switch (status) {
      case PageStatus.PROCESSING: return 'border-blue-500';
      case PageStatus.COMPLETED: return 'border-emerald-500';
      case PageStatus.FAILED: return 'border-red-500';
      default: return 'border-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 font-bengali">বাংলা বই OCR</h1>
          <p className="mt-2 text-lg text-gray-400">আপনার বইয়ের PDF আপলোড করুন এবং কৃত্রিম বুদ্ধিমত্তার সাহায্যে লেখা পান।</p>
        </header>

        <main className="space-y-8">
          {!isProcessing && pages.length === 0 && !isPdfLoading && (
             <div 
              onDragEnter={handleDragEvents}
              onDragOver={handleDragEvents}
              onDragLeave={handleDragEvents}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-emerald-400 bg-gray-800' : 'border-gray-600 hover:border-gray-500'}`}
             >
              <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
              <p className="text-gray-400 text-center mb-4">Drop your PDF book here</p>
              <label htmlFor="file-upload" className="cursor-pointer font-semibold text-emerald-400 hover:text-emerald-300 bg-gray-800 px-6 py-3 rounded-md transition-colors">
                Or Select PDF File
              </label>
              <input 
                id="file-upload" 
                type="file" 
                accept="application/pdf" 
                className="hidden"
                onChange={(e) => handlePdfFile(e.target.files ? e.target.files[0] : null)} 
              />
            </div>
          )}

          {isPdfLoading && (
            <div className="flex flex-col items-center justify-center p-12 bg-gray-800/50 rounded-lg">
                <SpinnerIcon className="w-16 h-16 text-emerald-400 animate-spin mb-4" />
                <p className="text-lg text-gray-300">Preparing PDF...</p>
                <p className="text-gray-400">This may take a moment for large books.</p>
            </div>
          )}

          {pages.length > 0 && (
            <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <h2 className="text-2xl font-semibold">{
                  (() => {
                    const doneCount = pages.filter(p => p.status === PageStatus.COMPLETED || p.status === PageStatus.FAILED).length;
                    if (isProcessing) return "Processing Pages...";
                    if (allPagesDone) {
                      const failedCount = pages.filter(p => p.status === PageStatus.FAILED).length;
                      return failedCount > 0 ? `Processing Complete (${failedCount} failed)` : "Processing Complete";
                    }
                    return `Progress: ${doneCount}/${pages.length} pages done`;
                  })()
                }</h2>
              </div>
              
              <div className="w-full bg-gray-700 rounded-full h-2.5 mb-4">
                <div className="bg-gradient-to-r from-emerald-400 to-cyan-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>

              <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-md mb-4 flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                      <input
                          type="checkbox"
                          id="select-all"
                          className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                          checked={allProcessableSelected}
                          onChange={handleSelectAll}
                          disabled={processablePageIds.length === 0 || isProcessing}
                          aria-label="Select all processable pages"
                      />
                      <label htmlFor="select-all" className="font-medium cursor-pointer">
                          {allProcessableSelected ? 'Deselect All' : 'Select All Processable'}
                      </label>
                      <span className="text-sm text-gray-400">({processablePageIds.length} items)</span>
                  </div>
                  <div className="flex items-center gap-4">
                      <span className="font-semibold">{selectedPages.size} pages selected</span>
                      <button
                          onClick={processSelectedPages}
                          disabled={selectedPages.size === 0 || isProcessing}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                      >
                          {isProcessing && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                          Process Selected
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[40vh] overflow-y-auto p-2 bg-gray-900/50 rounded-md">
                {pages.map((page, index) => (
                  <div 
                    key={page.id} 
                    onClick={() => handleToggleSelectPage(page.id)}
                    className={`group relative aspect-[3/4] rounded-md overflow-hidden border-2 bg-gray-700 ${getStatusBorderColor(page.status)} transition-all cursor-pointer ${selectedPages.has(page.id) ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-emerald-500' : ''}`}
                  >
                      <input
                          type="checkbox"
                          checked={selectedPages.has(page.id)}
                          onChange={() => handleToggleSelectPage(page.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 left-2 z-10 h-5 w-5 rounded bg-gray-800/50 border-gray-500 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          aria-label={`Select page ${index + 1}`}
                      />
                      <img src={page.previewUrl} alt={`Page ${index + 1}`} className={`w-full h-full object-cover transition-opacity ${page.status !== PageStatus.PENDING ? 'opacity-40' : 'opacity-90'}`} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-center">
                        <span className="text-white font-semibold text-xs">Page {index + 1}</span>
                      </div>
                      {(page.status === PageStatus.PROCESSING || page.status === PageStatus.FAILED || page.status === PageStatus.COMPLETED) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              {page.status === PageStatus.PROCESSING && <SpinnerIcon className="w-8 h-8 text-white animate-spin" />}
                              {page.status === PageStatus.FAILED && (
                                <div className="text-center">
                                  <XCircleIcon className="w-8 h-8 text-red-400 mx-auto" />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); retryPageProcessing(page.id); }}
                                    className="mt-2 p-1 rounded-full bg-gray-700/80 hover:bg-gray-600 transition-colors"
                                    aria-label={`Retry page ${index + 1}`}
                                  >
                                    <ReloadIcon className="w-5 h-5 text-gray-200" />
                                  </button>
                                </div>
                              )}
                              {page.status === PageStatus.COMPLETED && <CheckCircleIcon className="w-10 h-10 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedPages.length > 0 && (
            <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Extracted Text</h2>
                <button
                  onClick={copyToClipboard}
                  className="px-5 py-2 bg-gray-700 text-emerald-300 font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                >
                  {copySuccess || 'Copy All Text'}
                </button>
              </div>
              <div className="space-y-6 max-h-[50vh] overflow-y-auto p-4 bg-gray-900 rounded-md border border-gray-700 font-bengali text-lg leading-relaxed">
                {pages.map((page, index) => {
                  if (page.status === PageStatus.COMPLETED && page.text) {
                    return (
                      <div key={page.id} className="border-b border-gray-700 pb-4 last:border-b-0">
                        <p className="text-sm font-semibold text-cyan-400 mb-2">পৃষ্ঠা {index + 1}</p>
                        <p className="whitespace-pre-wrap">{page.text}</p>
                      </div>
                    );
                  }
                  if (page.status === PageStatus.FAILED) {
                     return (
                      <div key={page.id} className="border-b border-gray-700 pb-4 last:border-b-0">
                         <p className="text-sm font-semibold text-red-400 mb-2">Page {index + 1} - Failed</p>
                         <p className="text-sm text-red-300">{page.error}</p>
                      </div>
                     );
                  }
                  return null;
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
