# Bengali Book OCR with Gemini

This is a web application designed to extract text from Bengali storybooks using the power of Google's Gemini AI. Users can upload a PDF of a book, and the application will process each page, perform Optical Character Recognition (OCR), and present the extracted text in a clean, readable format.

The app is built to be efficient and user-friendly, providing a seamless experience for digitizing Bengali literature.

## ✨ Features

- **PDF Upload**: Easily upload an entire book in PDF format.
- **Automatic Page Extraction**: The application automatically splits the PDF into individual pages for processing.
- **AI-Powered OCR**: Leverages the Google Gemini Flash model for high-accuracy Bengali text extraction.
- **Selective Processing**: Users can select specific pages to process, giving them full control.
- **Real-time Progress**: A visual progress bar and status indicators for each page (Pending, Processing, Completed, Failed).
- **Retry Mechanism**: Easily retry failed pages with a single click.
- **Combined Text View**: All extracted text is aggregated in one place, organized by page number.
- **Copy to Clipboard**: A one-click button to copy all the extracted text.
- **Responsive Design**: A clean, modern, and responsive UI that works on all devices.

## 🚀 Tech Stack

- **Frontend**: React.js
- **Styling**: Tailwind CSS
- **AI Model**: Google Gemini (`gemini-2.5-flash`) via the `@google/genai` SDK
- **PDF Rendering**: PDF.js (`pdfjs-dist`)
- **Hosting**: GitHub Pages
- **Deployment**: Automated with GitHub Actions

## ⚙️ How It Works

1.  The user drops or selects a PDF file.
2.  The application uses `pdf.js` to render each page of the PDF onto an HTML `<canvas>` element.
3.  Each canvas is converted into a JPEG image file.
4.  The user selects the pages they want to process and clicks the "Process Selected" button.
5.  For each selected page, the image is converted to a Base64 string and sent to the Gemini API with a specific prompt asking for OCR in Bengali.
6.  The Gemini API returns the extracted text.
7.  The application UI updates in real-time to show the status of each page and displays the final text once completed.

## 📦 Deployment

This project is configured for continuous deployment to GitHub Pages using GitHub Actions. The workflow is defined in `.github/workflows/deploy.yml`.

Every push to the `main` branch automatically triggers a deployment, ensuring the live application is always up-to-date.
