'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  RefreshCw, 
  User, 
  Wand2, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Maximize2,
  Minimize2,
  ImageIcon,
  Sparkles,
  Eraser
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, Character } from './store';
import { StoryTemplate } from '@/components/create-game/data';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Step2CharacterProps {
  state: GameState;
  template: StoryTemplate;
  updateCharacters: (characters: Character[]) => void;
  onNext: () => void;
  onPrev: () => void;
}

// Helper for ID generation
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export default function Step2Character({ state, template, updateCharacters, onNext, onPrev }: Step2CharacterProps) {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const listEndRef = useRef<HTMLDivElement>(null);
  const characterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Ensure there is at least one character
  useEffect(() => {
    if (!state.characters || state.characters.length === 0) {
      updateCharacters([{
        id: generateId(),
        name: '',
        gender: undefined,
        role: undefined,
        archetype: '',
        background: '',
        traits: [],
        isExpanded: true
      } as unknown as Character]);
    }
  }, [state.characters, updateCharacters]);

  // Scroll to bottom when adding new character
  const scrollToBottom = () => {
    setTimeout(() => {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleAddCharacter = () => {
    const newChar: Character = {
      id: generateId(),
      name: '',
      gender: undefined as unknown as Character['gender'],
      role: undefined as unknown as Character['role'],
      archetype: '',
      background: '',
      traits: [],
      isExpanded: true
    };
    updateCharacters([...state.characters, newChar]);
    scrollToBottom();
  };

  const handleRemoveCharacter = (id: string) => {
    if (state.characters.length <= 1) return;
    updateCharacters(state.characters.filter(c => c.id !== id));
    // Clear errors for removed character
    const newErrors = { ...errors };
    delete newErrors[id];
    setErrors(newErrors);
  };

  const handleUpdateCharacter = (id: string, data: Partial<Character>) => {
    const newCharacters = state.characters.map(c => 
      c.id === id ? { ...c, ...data } : c
    );
    updateCharacters(newCharacters);
    
    // Clear error for the field being updated
    if (errors[id]) {
      const field = Object.keys(data)[0];
      if (field && errors[id][field]) {
        const newCharErrors = { ...errors[id] };
        delete newCharErrors[field];
        setErrors({ ...errors, [id]: newCharErrors });
      }
    }
  };

  const toggleExpand = (id: string) => {
    const char = state.characters.find(c => c.id === id);
    if (char) {
      handleUpdateCharacter(id, { isExpanded: !char.isExpanded });
    }
  };

  const toggleAll = (expand: boolean) => {
    const newCharacters = state.characters.map(c => ({ ...c, isExpanded: expand }));
    updateCharacters(newCharacters);
  };

  // Mock AI Character Generation
  const handleAiGenerate = async (id: string) => {
    setGeneratingId(id);
    setTimeout(() => {
      handleUpdateCharacter(id, {
        name: '亚历克斯·维恩',
        archetype: '反抗军黑客',
        gender: 'male',
        background: `在${template.name}的世界中，亚历克斯曾是一名顶级企业的安全顾问，直到他发现了公司深处的秘密。现在，他潜伏在暗影中，用他的代码对抗不公。`,
        traits: ['敏捷', '黑客技术', '逻辑清晰', '隐秘行动'],
      });
      setGeneratingId(null);
    }, 1500);
  };

  // Mock AI Image Generation
  const handleGenerateImage = async (id: string) => {
    setGeneratingImageId(id);
    // Simulate API call
    setTimeout(() => {
      // Use a placeholder image service or a static asset for demo
      // For now, let's use a placeholder service that generates consistent images based on seed
      const seed = Math.random().toString(36).substring(7);
      // Using a reliable placeholder service, e.g., DiceBear or similar, or just a generic one.
      // Since this is a "Game", maybe something more "artistic" if possible, but for now a placeholder is fine.
      // Let's use a solid color placeholder with text if no real image gen is available, 
      // or a generic avatar URL.
      // For demo purposes, I'll use a placeholder that looks like an avatar.
      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4`;
      
      handleUpdateCharacter(id, { avatar: avatarUrl });
      setGeneratingImageId(null);
    }, 2000);
  };

  const validate = () => {
    const newErrors: Record<string, Record<string, string>> = {};
    let isValid = true;
    let firstErrorId: string | null = null;

    state.characters.forEach(char => {
      const charErrors: Record<string, string> = {};
      
      // Name validation
      if (!char.name.trim()) {
        charErrors.name = '请输入角色姓名';
      } else if (char.name.length < 2 || char.name.length > 20) {
        charErrors.name = '姓名长度需在2-20个字符之间';
      } else if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s]+$/.test(char.name)) {
        charErrors.name = '姓名仅支持中英文、数字和空格';
      }

      // Gender validation
      if (!char.gender) {
        charErrors.gender = '请选择性别';
      }

      // Role validation (should always be set, but good to check)
      if (!char.role) {
         // Default to npc if missing? or error?
         // handleUpdateCharacter(char.id, { role: 'npc' });
      }
      
      if (Object.keys(charErrors).length > 0) {
        newErrors[char.id] = charErrors;
        isValid = false;
        if (!firstErrorId) firstErrorId = char.id;
      }
    });

    setErrors(newErrors);

    if (!isValid && firstErrorId) {
      // Expand the character with error
      const char = state.characters.find(c => c.id === firstErrorId);
      if (char && !char.isExpanded) {
        handleUpdateCharacter(firstErrorId, { isExpanded: true });
      }
      // Scroll to it
      setTimeout(() => {
        characterRefs.current[firstErrorId!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    return isValid;
  };

    const handleClearCharacter = (id: string) => {
    handleUpdateCharacter(id, {
      name: '',
      archetype: '',
      background: '',
      gender: undefined,
      role: undefined,
      avatar: undefined,
      traits: []
    });
  };

  const handleNextStep = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full relative"
    >
      <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground">角色设定</h2>
            <p className="text-muted-foreground text-sm">
              谁将在这个故事中展开冒险？您可以添加主角及重要的 NPC。
            </p>
          </div>
        </div>

        {/* Global Error Banner */}
        {Object.keys(errors).length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/15 text-destructive px-4 py-3 rounded-md flex items-center gap-2 text-sm border border-destructive/20"
          >
            <AlertCircle className="w-4 h-4" />
            <span>请修正下列错误后再继续</span>
          </motion.div>
        )}

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {state.characters.map((char, index) => (
              <motion.div
                key={char.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                ref={el => { if (el) characterRefs.current[char.id] = el; }}
                className={cn(
                  "border rounded-lg bg-card transition-colors duration-200",
                  errors[char.id] ? "border-destructive/50" : "border-border",
                  char.isExpanded ? "ring-1 ring-primary/5 border-primary/20" : "hover:border-primary/30"
                )}
              >
                {/* Card Header */}
                <div 
                  className={cn(
                    "flex items-center justify-between p-4 cursor-pointer select-none rounded-t-lg transition-colors",
                    char.isExpanded ? "bg-secondary/30" : "hover:bg-secondary/10"
                  )}
                  onClick={() => toggleExpand(char.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground">
                      {char.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="font-medium flex items-center gap-2">
                      <User className={cn("w-4 h-4", char.role === 'protagonist' ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn(!char.name && "text-muted-foreground italic")}>
                        {char.name || `角色 ${index + 1}`}
                      </span>
                      {!char.isExpanded && (
                        <div className="flex gap-2">
                            <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full border",
                                char.role === 'protagonist' 
                                    ? "bg-primary/10 text-primary border-primary/20" 
                                    : "bg-secondary text-muted-foreground border-transparent"
                            )}>
                                {char.role === 'protagonist' ? '主角' : 'NPC'}
                            </span>
                            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-transparent">
                                {char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : '未知性别'}
                            </span>
                        </div>
                      )}
                      {errors[char.id] && (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          有待办项
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCharacter(char.id);
                    }}
                    disabled={state.characters.length <= 1}
                    title="删除角色"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Card Body */}
                <AnimatePresence>
                  {char.isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 border-t border-border/50 space-y-4">
                        
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Left Column: Avatar Display Only */}
                            <div className="w-full md:w-40 flex-shrink-0">
                                <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center bg-secondary/10 relative overflow-hidden group">
                                    {char.avatar ? (
                                        <Image 
                                            src={char.avatar} 
                                            alt={char.name || "Character Avatar"} 
                                            fill 
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="text-center p-4 space-y-2">
                                            <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto" />
                                            <p className="text-xs text-muted-foreground">暂无角色立绘</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Basic Info - Vertical Stack */}
                            <div className="flex-1 flex flex-col gap-4">
                                <div className="space-y-2">
                                    <select
                                        className={cn(
                                            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                            !char.role && "text-muted-foreground"
                                        )}
                                        value={char.role || ''}
                                        onChange={(e) => handleUpdateCharacter(char.id, { role: e.target.value as Character['role'] })}
                                        aria-label="角色定位"
                                    >
                                        <option value="" disabled>定义角色</option>
                                        <option value="protagonist">主角</option>
                                        <option value="npc">NPC</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <Input
                                        value={char.name}
                                        onChange={(e) => handleUpdateCharacter(char.id, { name: e.target.value })}
                                        placeholder="角色姓名 *"
                                        className={cn(errors[char.id]?.name && "border-destructive focus-visible:ring-destructive")}
                                    />
                                    {errors[char.id]?.name && (
                                        <p className="text-xs text-destructive">{errors[char.id].name}</p>
                                    )}
                                </div>
                            
                                <div className="space-y-2">
                                    <select
                                        className={cn(
                                            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                            errors[char.id]?.gender && "border-destructive focus-visible:ring-destructive",
                                            !char.gender && "text-muted-foreground"
                                        )}
                                        value={char.gender || ''}
                                        onChange={(e) => handleUpdateCharacter(char.id, { gender: e.target.value as Character['gender'] })}
                                        aria-label="性别 *"
                                    >
                                        <option value="" disabled>定义性别</option>
                                        <option value="male">男性</option>
                                        <option value="female">女性</option>
                                        <option value="unknown">未知</option>
                                    </select>
                                    {errors[char.id]?.gender && (
                                        <p className="text-xs text-destructive">{errors[char.id].gender}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Input
                                        value={char.archetype}
                                        onChange={(e) => handleUpdateCharacter(char.id, { archetype: e.target.value })}
                                        placeholder="职业/原型 (如：黑客、骑士...)"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Background Story */}
                        <div className="space-y-2">
                            <Textarea
                                value={char.background}
                                onChange={(e) => handleUpdateCharacter(char.id, { background: e.target.value })}
                                placeholder="背景故事 (简述角色的过往经历...)"
                                className="min-h-[100px] leading-relaxed resize-none"
                            />
                        </div>

                        {/* Bottom Toolbar */}
                        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border/50">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleClearCharacter(char.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="重置默认"
                            >
                                <Eraser className="w-4 h-4" />
                            </Button>
                            
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAiGenerate(char.id)}
                                disabled={generatingId === char.id}
                                className="gap-2"
                                title="AI 生成角色设定"
                            >
                                {generatingId === char.id ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Wand2 className="w-4 h-4 text-purple-500" />
                                )}
                                <span className="sr-only">生成角色</span>
                            </Button>

                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleGenerateImage(char.id)}
                                disabled={
                                    generatingImageId === char.id || 
                                    !char.role || 
                                    !char.gender || 
                                    !char.archetype || 
                                    !char.background
                                }
                                title={(!char.role || !char.gender || !char.archetype || !char.background) ? "请先完善角色定位、性别、职业和背景故事" : "AI 生成立绘"}
                                className="gap-2"
                            >
                                {generatingImageId === char.id ? (
                                    <Sparkles className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ImageIcon className="w-4 h-4 text-blue-500" />
                                )}
                                <span className="sr-only">生成立绘</span>
                            </Button>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>

          <div ref={listEndRef} />
          
          <Button
            variant="outline"
            className="w-full border-dashed border-2 h-12 hover:bg-secondary/50 hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors"
            onClick={handleAddCharacter}
          >
            <Plus className="w-4 h-4 mr-2" />
            添加角色
          </Button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex gap-3 z-20">
        <Button variant="outline" onClick={onPrev} size="lg" className="flex-1">
          上一步
        </Button>
        <Button 
          onClick={handleNextStep} 
          size="lg"
          className="flex-[2]"
        >
          下一步：开启冒险
        </Button>
      </div>
    </motion.div>
  );
}
