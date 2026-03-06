import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import { logActivity } from '../../lib/activity';

export interface FilesTabProps {
  project: Project;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
}

export const FilesTab: React.FC<FilesTabProps> = ({
  project,
  onUpdateProject,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Files</h3>
        <label className="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer flex items-center gap-2">
          <Icons.Upload size={14} />
          Upload File
          <input type="file" className="hidden" multiple onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
            const fileList = e.target.files;
            if (!fileList || !project) return;
            const newFiles = [...project.files];
            for (let i = 0; i < fileList.length; i++) {
              const f = fileList[i];
              const sizeStr = f.size < 1024 ? `${f.size} B`
                : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB`
                : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
              newFiles.push({
                name: f.name,
                type: f.type || f.name.split('.').pop() || 'file',
                size: sizeStr,
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              });
            }
            await onUpdateProject(project.id, { files: newFiles });
            await logActivity({ action: 'uploaded files', target: `${fileList.length} file(s)`, project_title: project.title, type: 'project_update' });
            e.target.value = '';
          }} />
        </label>
      </div>
      {project.files.length === 0 ? (
        <div className="text-center py-16 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <Icons.File size={36} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No files yet</p>
          <p className="text-xs text-zinc-400">Upload files to keep project assets organized.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {project.files.map((file, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -2 }}
              className="group relative p-4 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center"
            >
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const updated = project.files.filter((_, idx) => idx !== i);
                  await onUpdateProject(project.id, { files: updated });
                }}
                className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                title="Remove file"
              >
                <Icons.Trash size={12} />
              </button>
              <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-xl flex items-center justify-center text-zinc-400 mb-3 group-hover:scale-105 transition-transform">
                <Icons.File size={24} />
              </div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate w-full mb-1">{file.name}</div>
              <div className="text-[10px] text-zinc-400">{file.size} · {file.date}</div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
