
export enum TemplateCategory {
  SCI_FI = 'SCI_FI',
  FANTASY = 'FANTASY',
  ROMANCE = 'ROMANCE',
  CUSTOM = 'CUSTOM',
}

export interface StoryTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  description: string;
  features: string[];
  scenarios: string[];
  color: string;
  iconName: string; // Using Lucide icon names as strings
  backgroundImage?: string;
}

export const TEMPLATES: StoryTemplate[] = [
  {
    id: 'sci-fi-1',
    category: TemplateCategory.SCI_FI,
    name: '赛博朋克 2077',
    description: '在被巨型企业掌控的未来都市中，你可以是一个试图生存的街头小子，也可以是寻找真相的黑客。这里充斥着高科技与低生活的冲突，霓虹灯下隐藏着无尽的阴谋。',
    features: ['赛博义体改造', '黑客入侵网络', '飞行汽车追逐', '企业战争'],
    scenarios: ['夜之城街头', '荒坂塔顶层', '地下非法诊所', '废弃的数据中心'],
    color: 'from-cyan-500 to-blue-600',
    iconName: 'Cpu',
    backgroundImage: '/赛博朋克2077.png',
  },
  {
    id: 'sci-fi-2',
    category: TemplateCategory.SCI_FI,
    name: '星际迷航',
    description: '作为星际联邦的一员，你将驾驶飞船探索未知的星系，接触新的文明，解开宇宙深处的奥秘。',
    features: ['星际飞船驾驶', '外星文明外交', '空间跳跃技术', '未知生物研究'],
    scenarios: ['企业号舰桥', '未知星球表面', '空间站交易所', '黑洞边缘'],
    color: 'from-indigo-500 to-purple-600',
    iconName: 'Rocket',
  },
  {
    id: 'fantasy-1',
    category: TemplateCategory.FANTASY,
    name: '中土世界',
    description: '踏上前往末日火山的征途，或者在精灵的森林中寻找古老的智慧。这是一个剑与魔法的世界，巨龙、兽人和巫师共存。',
    features: ['魔法咒语施放', '冷兵器格斗', '神话生物驯服', '古代遗迹探险'],
    scenarios: ['霍比特人村庄', '瑞文戴尔', '刚铎王城', '摩瑞亚矿坑'],
    color: 'from-green-500 to-emerald-700',
    iconName: 'Sword',
  },
  {
    id: 'fantasy-2',
    category: TemplateCategory.FANTASY,
    name: '希腊神话',
    description: '与奥林匹斯众神互动，成为赫拉克勒斯般的英雄，或者在冥界中寻找失去的爱人。神明的意志决定着凡人的命运。',
    features: ['神力加持', '神话怪兽战斗', '奥林匹斯山朝圣', '冥界试炼'],
    scenarios: ['奥林匹斯山', '雅典卫城', '特洛伊战场', '冥河渡口'],
    color: 'from-yellow-500 to-orange-600',
    iconName: 'Scroll',
  },
  {
    id: 'romance-1',
    category: TemplateCategory.ROMANCE,
    name: '现代都市情缘',
    description: '在繁忙的都市中，一段意想不到的邂逅即将发生。是职场上的欢喜冤家，还是久别重逢的青梅竹马？',
    features: ['职场恋爱', '误会与和解', '浪漫约会', '情感抉择'],
    scenarios: ['高级写字楼', '深夜咖啡馆', '雨中公园', '海边度假村'],
    color: 'from-pink-500 to-rose-600',
    iconName: 'Heart',
  },
  {
    id: 'romance-2',
    category: TemplateCategory.ROMANCE,
    name: '宫廷秘史',
    description: '穿越回古代宫廷，卷入权力的漩涡与爱恨情仇之中。你的每一个选择都可能改变历史的走向，也能决定你能否与心爱之人相守。',
    features: ['宫廷斗争', '禁忌之恋', '权谋策略', '历史重演'],
    scenarios: ['皇宫御花园', '冷宫深处', '皇帝寝宫', '京城繁华街道'],
    color: 'from-red-500 to-rose-800',
    iconName: 'Crown',
  },
  {
    id: 'custom-1',
    category: TemplateCategory.CUSTOM,
    name: '自定义世界',
    description: '不受任何限制，完全由你构建的世界。设定你的规则，创造你的角色，书写属于你独一无二的故事。',
    features: ['完全自由设定', '混合多种风格', '独特的世界观', '无限可能'],
    scenarios: ['空白画布', '你的想象空间'],
    color: 'from-gray-500 to-slate-700',
    iconName: 'Pencil',
  },
];
