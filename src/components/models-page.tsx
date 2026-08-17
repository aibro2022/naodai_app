import { HardDrive, Cloud, CloudDownload } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const tabs = [
  { value: 'local', label: '本地模型', icon: HardDrive, description: '本地可运行模型' },
  { value: 'optional', label: '可选模型', icon: CloudDownload, description: '可下载运行模型' },
  { value: 'remote', label: '云端模型', icon: Cloud, description: '云端模型服务' },
];

export function ModelsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <Tabs defaultValue="local" className="w-full max-w-2xl">
        <TabsList className="sticky top-0 z-10 mx-auto flex w-fit">
          {tabs.map((tab) => (
            <Tooltip key={tab.value}>
              <TooltipTrigger asChild>
                <TabsTrigger value={tab.value}>
                  <tab.icon />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>{tab.description}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}