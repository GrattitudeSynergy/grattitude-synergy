import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { Card, Button, Badge, Table, Modal, useToast } from '../components/DesignSystem';
import { FirestoreEngine } from '../firebase/firebaseConfig';
import { AuditService } from '../services/auditService';
import { SEED_DEFAULT_FORM_FIELDS } from '../seedData';
import type {
  DynamicFormField,
  FormSectionType,
  FormFieldType,
  Employee,
} from '../types';

export const EmployeeFormBuilder: React.FC<{ currentAdmin: Employee }> = ({
  currentAdmin,
}) => {
  const { showToast } = useToast();
  const [fields, setFields] = useState<DynamicFormField[]>(SEED_DEFAULT_FORM_FIELDS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<DynamicFormField | null>(null);

  // Field Form State
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [section, setSection] = useState<FormSectionType>('Custom Attributes');
  const [type, setType] = useState<FormFieldType>('text');
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');
  const [placeholder, setPlaceholder] = useState('');

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<any>('app_settings', (items) => {
      const schema = items.find((i) => i.id === 'employee_form_schema');
      if (schema && Array.isArray(schema.fields)) {
        setFields([...schema.fields].sort((a, b) => a.order - b.order));
      }
    });
    return () => unsub();
  }, []);

  const persistFields = async (nextFields: DynamicFormField[], logDetail: string) => {
    const normalized = nextFields.map((f, idx) => ({ ...f, order: idx + 1 }));
    setFields(normalized);
    await FirestoreEngine.setDocument('app_settings', 'employee_form_schema', {
      id: 'employee_form_schema',
      fields: normalized,
      updatedAt: new Date().toISOString(),
    });
    await AuditService.log({
      action: 'FORM_BUILDER_SCHEMA_UPDATED',
      actor: currentAdmin,
      targetId: 'employee_form_schema',
      targetType: 'FormSchema',
      details: logDetail,
    });
  };

  const openAddFieldModal = () => {
    setEditingField(null);
    setLabel('');
    setKey('');
    setSection('Custom Attributes');
    setType('text');
    setRequired(false);
    setOptionsText('');
    setPlaceholder('');
    setModalOpen(true);
  };

  const openEditFieldModal = (field: DynamicFormField) => {
    setEditingField(field);
    setLabel(field.label);
    setKey(field.key);
    setSection(field.section);
    setType(field.type);
    setRequired(field.required);
    setOptionsText((field.options || []).join(', '));
    setPlaceholder(field.placeholder || '');
    setModalOpen(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !key.trim()) return;

    const parsedOptions =
      type === 'select'
        ? optionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    if (editingField) {
      const updated = fields.map((f) =>
        f.id === editingField.id
          ? {
              ...f,
              label: label.trim(),
              section,
              type,
              required,
              options: parsedOptions,
              placeholder: placeholder.trim(),
            }
          : f
      );
      await persistFields(updated, `Edited onboarding field "${label.trim()}" (${key}).`);
      showToast('success', 'Form Field Updated', `"${label}" configuration saved.`);
    } else {
      const cleanKey = key
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase();
      const newField: DynamicFormField = {
        id: `fld_${Date.now()}`,
        key: cleanKey,
        label: label.trim(),
        section,
        type,
        required,
        options: parsedOptions,
        placeholder: placeholder.trim(),
        isSystem: false,
        order: fields.length + 1,
      };
      await persistFields(
        [...fields, newField],
        `Added custom onboarding field "${newField.label}" in section ${newField.section}.`
      );
      showToast('success', 'Custom Field Added', `"${newField.label}" added to onboarding form.`);
    }
    setModalOpen(false);
  };

  const handleDeleteField = async (field: DynamicFormField) => {
    if (field.isSystem) return;
    const filtered = fields.filter((f) => f.id !== field.id);
    await persistFields(filtered, `Removed custom field "${field.label}" (${field.key}).`);
    showToast('info', 'Field Removed', `"${field.label}" removed from schema.`);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return;
    const copy = [...fields];
    const temp = copy[index];
    copy[index] = copy[swapIdx];
    copy[swapIdx] = temp;
    await persistFields(copy, `Reordered field "${temp.label}".`);
  };

  const sections: FormSectionType[] = [
    'Identity',
    'Job Details',
    'Access Flags',
    'Custom Attributes',
  ];

  return (
    <div className="space-y-5">
      <Card
        title="Dynamic Employee Onboarding Form Builder"
        subtitle="Configure fields across Identity, Job Details, Access Flags, and Custom Attributes. Changes reflect immediately in AddEmployeeModal."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={openAddFieldModal}
          >
            Add Onboarding Field
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {sections.map((sec) => {
            const count = fields.filter((f) => f.section === sec).length;
            return (
              <div
                key={sec}
                className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg"
              >
                <div className="text-xs font-bold text-neutral-800">{sec}</div>
                <div className="text-lg font-extrabold text-neutral-900 mt-0.5">
                  {count} <span className="text-xs font-normal text-neutral-500">fields</span>
                </div>
              </div>
            );
          })}
        </div>

        <Table
          headers={[
            'Order',
            'Field Label & Key',
            'Section',
            'Data Type',
            'Validation',
            'Dropdown Options',
            'Actions',
          ]}
        >
          {fields.map((f, idx) => (
            <tr key={f.id} className="hover:bg-neutral-50">
              <td className="px-4 py-3 text-xs font-mono">
                <div className="flex items-center gap-1">
                  <span className="w-5 text-neutral-500">#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 'down')}
                    disabled={idx === fields.length - 1}
                    className="p-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="text-xs font-bold text-neutral-900">{f.label}</div>
                <div className="text-[11px] font-mono text-neutral-500">{f.key}</div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="info">{f.section}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="neutral" className="font-mono uppercase">
                  {f.type}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {f.required ? (
                  <Badge variant="warning">Mandatory</Badge>
                ) : (
                  <Badge variant="neutral">Optional</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-neutral-600 max-w-xs truncate">
                {f.options && f.options.length > 0 ? f.options.join(', ') : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<Sliders className="w-3 h-3" />}
                    onClick={() => openEditFieldModal(f)}
                  >
                    Edit
                  </Button>
                  {!f.isSystem && (
                    <Button
                      size="xs"
                      variant="danger"
                      icon={<Trash2 className="w-3 h-3" />}
                      onClick={() => handleDeleteField(f)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        size="md"
        title={editingField ? `Edit Form Field — ${editingField.label}` : 'Add Onboarding Field'}
        subtitle="Configure field type, section placement, dropdown options, and mandatory validation."
      >
        <form onSubmit={handleSaveField} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Field Label *
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!editingField) {
                  setKey(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '_')
                      .replace(/^_|_$/g, '')
                  );
                }
              }}
              placeholder="e.g. GitHub Handle or Dietary Preference"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Attribute Key *
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editingField)}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg disabled:bg-neutral-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Form Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as FormSectionType)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Field Data Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormFieldType)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="email">email</option>
                <option value="date">date</option>
                <option value="select">select (Dropdown)</option>
                <option value="boolean">boolean (Checkbox)</option>
                <option value="textarea">textarea</option>
              </select>
            </div>
          </div>

          {type === 'select' && (
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Dropdown Options (Comma-Separated) *
              </label>
              <input
                type="text"
                required
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Option A, Option B, Option C"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Placeholder Hint
            </label>
            <input
              type="text"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              placeholder="Optional input hint"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              <span>Enforce as Mandatory Field during Employee Onboarding</span>
            </label>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={<Save className="w-3.5 h-3.5" />}
            >
              Save Field Schema
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
