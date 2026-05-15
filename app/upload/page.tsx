import UploadForm from '@/components/upload/upload-form'

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto pb-20 md:pb-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Upload Contract</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a PDF, DOCX, or paste text. Our AI will analyze it in seconds.
        </p>
      </div>
      <UploadForm />
    </div>
  )
}
