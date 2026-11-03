import React, { useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  FolderOpen,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import type {
  Employee,
  ShowupDocument,
  DocumentCategory,
} from '../../core/types';

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'];

export const DocumentVaultView: React.FC<{
  currentEmployee: Employee;
  documents: ShowupDocument[];
}> = ({ currentEmployee, documents }) => {
  const { showToast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [uploadOpen, setUploadOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(
    'Education Certificates'
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const visibleDocs = documents.filter((d) => {
    const matchesOwner = isAdmin || d.employeeId === currentEmployee.id;
    const matchesCat =
      categoryFilter === 'ALL' || d.category === categoryFilter;
    return matchesOwner && matchesCat;
  });

  const categories: DocumentCategory[] = [
    'Education Certificates',
    'Employment/Legal',
    'Identity/Tax',
    'Other',
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(
        `Invalid file type (.${ext}). Allowed formats: PDF, PNG, JPG, DOC, DOCX.`
      );
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedFile) {
      setFileError('Please provide a document title and valid file.');
      return;
    }

    const newDoc: ShowupDocument = {
      id: `doc_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      title: title.trim(),
      category,
      fileName: selectedFile.name,
      fileType: selectedFile.type || 'application/pdf',
      fileSizeKb: Math.max(1, Math.round(selectedFile.size / 1024)),
      status: 'Pending Verification',
      uploadedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('showup_documents', newDoc.id, newDoc);
    await AuditService.log({
      action: 'DOCUMENT_UPLOADED',
      actor: currentEmployee,
      targetId: newDoc.id,
      targetType: 'ShowupDocument',
      details: `Uploaded "${newDoc.title}" (${newDoc.category}) — ${newDoc.fileName}.`,
    });

    showToast(
      'success',
      'Document Uploaded to Vault',
      `"${newDoc.title}" queued for Admin verification.`
    );
    setTitle('');
    setSelectedFile(null);
    setUploadOpen(false);
  };

  const handleVerifyStatus = async (
    docItem: ShowupDocument,
    status: 'Verified' | 'Rejected'
  ) => {
    await FirestoreEngine.updateDocument<ShowupDocument>(
      'showup_documents',
      docItem.id,
      {
        status,
        verifiedBy: currentEmployee.name,
        verifiedAt: new Date().toISOString(),
      }
    );
    await AuditService.log({
      action: `DOCUMENT_${status.toUpperCase()}`,
      actor: currentEmployee,
      targetId: docItem.id,
      targetType: 'ShowupDocument',
      details: `Admin marked document "${docItem.title}" (${docItem.employeeName}) as ${status}.`,
    });
    showToast(
      status === 'Verified' ? 'success' : 'warning',
      `Document ${status}`,
      `"${docItem.title}" marked as ${status}.`
    );
  };

  return (
    <div className="space-y-5">
      {/* 4 Category Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const count = documents.filter(
            (d) =>
              (isAdmin || d.employeeId === currentEmployee.id) &&
              d.category === cat
          ).length;
          const active = categoryFilter === cat;
          return (
            <div
              key={cat}
              onClick={() =>
                setCategoryFilter(active ? 'ALL' : cat)
              }
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                active
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <FolderOpen className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-mono font-bold">{count} files</span>
              </div>
              <div className="text-xs font-bold mt-2">{cat}</div>
            </div>
          );
        })}
      </div>

      <Card
        title="Corporate Document Vault (showup_documents)"
        subtitle="4-category repository with client-side file type validation and Admin verification badge workflow."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => setUploadOpen(true)}
          >
            Upload Document
          </Button>
        }
      >
        {visibleDocs.length === 0 ? (
          <EmptyState
            title="No Documents in Selected Vault Category"
            description="Upload Education Certificates, Employment/Legal agreements, Identity/Tax proofs, or Other corporate records."
            icon={<FileText className="w-6 h-6 text-sky-600" />}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => setUploadOpen(true)}
              >
                Upload First Document
              </Button>
            }
          />
        ) : (
          <Table
            headers={[
              'Document Title',
              'Employee',
              'Category',
              'File Metadata',
              'Verification Badge',
              ...(isAdmin ? ['Admin Verification Workflow'] : []),
            ]}
          >
            {visibleDocs.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-xs font-bold text-neutral-900">
                  {d.title}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-700">
                  {d.employeeName}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="info">{d.category}</Badge>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-neutral-600">
                  {d.fileName} ({d.fileSizeKb} KB)
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      d.status === 'Verified'
                        ? 'success'
                        : d.status === 'Rejected'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {d.status === 'Verified' && (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {d.status === 'Rejected' && (
                      <XCircle className="w-3 h-3" />
                    )}
                    {d.status === 'Pending Verification' && (
                      <Clock className="w-3 h-3" />
                    )}
                    {d.status}
                  </Badge>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="success"
                        onClick={() => handleVerifyStatus(d, 'Verified')}
                      >
                        Verify
                      </Button>
                      <Button
                        size="xs"
                        variant="danger"
                        onClick={() => handleVerifyStatus(d, 'Rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Upload Document Modal */}
      <Modal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        size="md"
        title="Upload Document to Vault"
        subtitle="Supported file types: PDF, PNG, JPG, DOC, DOCX."
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {fileError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {fileError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Document Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. B.Tech Degree Certificate or PAN Card Copy"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Repository Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Select File (PDF, PNG, JPG, DOC, DOCX) *
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={handleFileSelect}
              className="w-full text-xs text-neutral-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-neutral-300 file:text-xs file:font-bold file:bg-neutral-50 hover:file:bg-neutral-100"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Upload & Submit for Verification
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
