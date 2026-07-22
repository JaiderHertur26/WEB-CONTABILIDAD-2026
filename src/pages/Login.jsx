import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, getCompanies, saveCompanies } from '@/contexts/LocalAuthContext'; // IMPORTAMOS LA CONEXIÓN A LA NUBE
import { storage } from '@/lib/storage';
import { 
  LogIn, User, Lock, Building, Shield, Key, Phone, MapPin, 
  Hash, Plus, Trash2, CornerDownRight, Layers, 
  AlertCircle, ArrowRight, Save, Hexagon, Network, CheckCircle2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { generateCompanySerial } from '@/lib/auth-utils';
import { cn } from '@/lib/utils';

const Login = () => {
  const [companies, setCompanies] = useState([]);
  const { toast } = useToast();
  const { login } = useAuth();

  // Login States
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  // Register / Builder States
  const [regStep, setRegStep] = useState(1); // 1: Auth, 2: Builder
  const [rootAuth, setRootAuth] = useState({ doc: '', serial: '' });
  const [hierarchy, setHierarchy] = useState([]); 
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', address: '', phone: '', 
    username: '', password: '', partialPassword: ''
  });

  // Sub-company add state
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [newSubData, setNewSubData] = useState({ doc: '', serial: '' });

  // CARGAMOS LAS EMPRESAS DIRECTO DE LA NUBE
  useEffect(() => {
    const loadData = async () => {
      try {
          // Descarga desde Supabase
          const cloudCompanies = await getCompanies();
          setCompanies(cloudCompanies);
          // Actualizamos la caché local por seguridad
          await storage.setItem('companies', JSON.stringify(cloudCompanies));
      } catch (error) {
          console.error("Error al cargar empresas en el login:", error);
      }
    };
    loadData();
  }, []);

  const handleCompanySelect = (id) => {
      setSelectedCompanyId(id);
      setLoginUsername('');
      setLoginPassword('');
  };

  // --- Login Logic ---
  const handleLoginSubmit = async (e) => {
    e.preventDefault();

    if (!selectedCompanyId) {
      toast({ variant: "destructive", title: "Error", description: "Selecciona una empresa o administrador." });
      return;
    }

    // ADMIN GENERAL
    if (selectedCompanyId === 'general_admin') {
      if (loginUsername === 'hertur26' && loginPassword === '1052042443-Ht') {
        toast({ title: "Bienvenido Administrador", description: "Acceso concedido." });
        await login({ isGeneralAdmin: true, accessLevel: 'full' });
      } else {
        toast({ variant: "destructive", title: "Acceso Denegado", description: "Usuario o contraseña incorrectos." });
      }
      return;
    }

    // EMPRESAS
    const company = companies.find(c => c.id === selectedCompanyId);

    if (!company) {
      toast({ variant: "destructive", title: "Error", description: "Empresa no encontrada." });
      return;
    }

    if (company.username !== loginUsername) {
      toast({ variant: "destructive", title: "Error", description: "Usuario incorrecto." });
      return;
    }

    if (company.password === loginPassword) {
      await login({ isGeneralAdmin: false, company, accessLevel: 'full' });
      return;
    }

    if (company.partialPassword === loginPassword) {
      await login({ isGeneralAdmin: false, company, accessLevel: 'partial' });
      return;
    }

    toast({ variant: "destructive", title: "Error", description: "Contraseña incorrecta." });
  };


  // --- Registration Logic ---
  const handleStartRegistration = async (e) => {
    e.preventDefault();
    const expected = await generateCompanySerial(rootAuth.doc);
    if (!expected || expected !== rootAuth.serial) {
        toast({ variant: "destructive", title: "Serial Inválido", description: "El serial no coincide con el documento." });
        return;
    }

    const existing = companies.find(c => c.doc === rootAuth.doc);
    if (existing && existing.username) {
        toast({ variant: "destructive", title: "Ya registrado", description: "Esta empresa ya tiene usuario." });
        return;
    }

    const rootNode = {
        id: existing ? existing.id : Date.now().toString(),
        doc: rootAuth.doc,
        authSerial: rootAuth.serial,
        name: existing ? existing.name : '',
        parentId: null,
        address: '', phone: '', username: '', password: '', partialPassword: '',
        isRoot: true
    };

    setHierarchy([rootNode]);
    setSelectedNodeId(rootNode.id);
    setFormData({
        name: rootNode.name, address: '', phone: '', 
        username: '', password: '', partialPassword: ''
    });
    setRegStep(2);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHierarchy(prev => prev.map(node => 
        node.id === selectedNodeId ? { ...node, [field]: value } : node
    ));
  };

  const handleAddSubCompany = async () => {
    const expected = await generateCompanySerial(newSubData.doc);
    if (!expected || expected !== newSubData.serial) {
        toast({ variant: "destructive", title: "Serial Inválido", description: "Verifica el NIT y Serial de la sub-empresa." });
        return;
    }
    if (hierarchy.some(n => n.doc === newSubData.doc)) {
        toast({ variant: "destructive", title: "Duplicado", description: "Esta empresa ya está en la lista." });
        return;
    }

    const parentId = selectedNodeId; 
    const newNode = {
        id: Date.now().toString(),
        doc: newSubData.doc,
        authSerial: newSubData.serial,
        name: '',
        parentId: parentId,
        address: '', phone: '', username: '', password: '', partialPassword: '',
        isRoot: false
    };

    setHierarchy(prev => [...prev, newNode]);
    setNewSubData({ doc: '', serial: '' });
    setIsAddingSub(false);
    setSelectedNodeId(newNode.id);
    setFormData({ name: '', address: '', phone: '', username: '', password: '', partialPassword: '' });
    toast({ title: "Sub-empresa agregada", description: "Completa sus datos." });
  };

  const handleDeleteNode = (nodeId) => {
    const node = hierarchy.find(n => n.id === nodeId);
    if (node.isRoot) {
        if(!window.confirm("¿Eliminar la empresa raíz cancelará todo el registro. ¿Continuar?")) return;
        setRegStep(1);
        setHierarchy([]);
        setRootAuth({ doc: '', serial: '' });
        return;
    }
    
    const getDescendants = (id, list) => {
        const children = list.filter(n => n.parentId === id);
        let ids = children.map(c => c.id);
        children.forEach(c => ids = [...ids, ...getDescendants(c.id, list)]);
        return ids;
    };
    
    const toDelete = [nodeId, ...getDescendants(nodeId, hierarchy)];
    setHierarchy(prev => prev.filter(n => !toDelete.includes(n.id)));
    
    if (selectedNodeId === nodeId) {
        const root = hierarchy.find(n => n.isRoot);
        setSelectedNodeId(root.id);
        setFormData({
            name: root.name, address: root.address, phone: root.phone,
            username: root.username, password: root.password, partialPassword: root.partialPassword
        });
    }
  };

  const handleSelectNode = (node) => {
    setSelectedNodeId(node.id);
    setFormData({
        name: node.name || '', address: node.address || '', phone: node.phone || '',
        username: node.username || '', password: node.password || '', partialPassword: node.partialPassword || ''
    });
  };

  // ACTUALIZADO PARA GUARDAR NUEVOS REGISTROS DIRECTO A LA NUBE
  const handleFinalizeRegistration = async () => {
    if (hierarchy.some(n => !n.name.trim())) {
        toast({ variant: "destructive", title: "Datos incompletos", description: "Todas las empresas deben tener un nombre." });
        return;
    }
    const root = hierarchy.find(n => n.isRoot);
    if (!root.username || !root.password) {
        toast({ variant: "destructive", title: "Datos incompletos", description: "La empresa raíz requiere Usuario y Contraseña." });
        return;
    }
    
    try {
        const currentCloud = await getCompanies();
        let currentStorage = [...currentCloud];
        
        hierarchy.forEach(newNode => {
            const idx = currentStorage.findIndex(c => c.doc === newNode.doc);
            if (idx >= 0) {
                currentStorage[idx] = { ...currentStorage[idx], ...newNode };
            } else {
                currentStorage.push(newNode);
            }
        });

        // 1. Guardar en Supabase
        await saveCompanies(currentStorage);
        // 2. Guardar en local cache
        await storage.setItem('companies', JSON.stringify(currentStorage));
        setCompanies(currentStorage);
        
        toast({ title: "¡Registro Exitoso!", description: "Empresas registradas correctamente en la nube." });
        
        setRegStep(1);
        setHierarchy([]);
        setRootAuth({ doc: '', serial: '' });
        setIsAddingSub(false);
        
        const tabTrigger = document.querySelector('[data-value="login"]');
        if (tabTrigger) tabTrigger.click();

    } catch (error) {
        toast({ variant: "destructive", title: "Error de conexión", description: "No se pudieron guardar las empresas en la nube." });
    }
  };

  const renderTree = (parentId = null, depth = 0) => {
    const nodes = hierarchy.filter(n => n.parentId === parentId);
    if (nodes.length === 0) return null;

    return (
        <div className="space-y-1">
            {nodes.map(node => (
                <div key={node.id} className="relative">
                    <div 
                        className={cn(
                            "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border",
                            selectedNodeId === node.id 
                                ? "bg-blue-50 border-blue-200 shadow-sm" 
                                : "hover:bg-slate-50 border-transparent"
                        )}
                        style={{ marginLeft: `${depth * 20}px` }}
                        onClick={() => handleSelectNode(node)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            {node.isRoot ? <Building className="w-4 h-4 text-blue-600 shrink-0" /> : <CornerDownRight className="w-4 h-4 text-slate-400 shrink-0" />}
                            <span className={cn("truncate text-sm font-medium", !node.name && "text-slate-400 italic")}>
                                {node.name || "Sin nombre"}
                            </span>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-400 hover:text-red-600"
                            onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                        >
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                    {renderTree(node.id, depth + 1)}
                </div>
            ))}
        </div>
    );
  };

  return (
    <>
      <Helmet><title>Acceso y Registro - JaiderHerTur26</title></Helmet>
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
             <div className="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-blue-900/20 blur-3xl"></div>
             <div className="absolute top-[40%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-900/20 blur-3xl"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={cn(
              "w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500 relative z-10 border border-slate-800/50",
              regStep === 2 ? "max-w-5xl" : "max-w-md"
          )}
        >
           {/* BRAND HEADER */}
           <div className="bg-white p-8 text-center border-b border-slate-100 relative overflow-hidden">
                <div className="flex flex-col items-center justify-center gap-3">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                        <div className="absolute inset-0 bg-blue-600 rounded-2xl rotate-6 opacity-20"></div>
                        <div className="absolute inset-0 bg-blue-600 rounded-2xl -rotate-6 opacity-20"></div>
                        <div className="relative w-full h-full bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg text-white">
                            <Network className="w-8 h-8" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm border border-slate-100">
                             <Shield className="w-4 h-4 text-indigo-600" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            JaiderHerTur<span className="text-blue-600">26</span>
                        </h1>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mt-1">Sistema Contable & Financiero</p>
                    </div>
                </div>
           </div>

           <div className="p-6 md:p-8">
                <Tabs defaultValue="login" className="w-full">
                    {regStep === 1 && (
                        <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-100 p-1 h-12 rounded-xl">
                            <TabsTrigger value="login" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm h-full">Seleccionar Empresa</TabsTrigger>
                            <TabsTrigger value="register" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm h-full">Crear Empresa</TabsTrigger>
                        </TabsList>
                    )}

                    {/* LOGIN TAB - UPDATED AS PER TASK 2 */}
                    <TabsContent value="login" className="mt-0">
                         {/* Company Grid Selector */}
                         <div className="grid grid-cols-2 gap-3 mb-6 max-h-[200px] overflow-y-auto p-1">
                             <button
                                onClick={() => handleCompanySelect('general_admin')}
                                className={cn(
                                    "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all gap-2",
                                    selectedCompanyId === 'general_admin' 
                                        ? "border-purple-600 bg-purple-50 text-purple-700 shadow-md ring-2 ring-purple-200" 
                                        : "border-slate-100 hover:border-purple-200 hover:bg-slate-50 text-slate-600"
                                )}
                             >
                                 <Shield className="w-6 h-6" />
                                 <span className="text-xs font-bold text-center">Administrador General</span>
                             </button>
                             
                             {companies.filter(c => c.username).map(company => (
                                 <button
                                    key={company.id}
                                    onClick={() => handleCompanySelect(company.id)}
                                    className={cn(
                                        "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all gap-2 relative",
                                        selectedCompanyId === company.id 
                                            ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-200" 
                                            : "border-slate-100 hover:border-blue-200 hover:bg-slate-50 text-slate-600"
                                    )}
                                 >
                                     <Building className="w-6 h-6" />
                                     <span className="text-xs font-bold text-center truncate w-full">{company.name}</span>
                                     {selectedCompanyId === company.id && <div className="absolute top-2 right-2 text-blue-600"><CheckCircle2 className="w-4 h-4"/></div>}
                                 </button>
                             ))}
                         </div>

                         <form onSubmit={handleLoginSubmit} className="space-y-6">
                            {selectedCompanyId && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Usuario</Label>
                                        <div className="relative group">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                                            <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full pl-10 pr-4 h-12 border border-slate-200 bg-slate-50 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Ingresa usuario" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Contraseña</Label>
                                        <div className="relative group">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                                            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full pl-10 pr-4 h-12 border border-slate-200 bg-slate-50 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••" />
                                        </div>
                                    </div>
                                    
                                    <Button type="submit" className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 rounded-xl font-medium tracking-wide transition-all active:scale-95">
                                        Entrar al Sistema <ArrowRight className="w-5 h-5 ml-2" />
                                    </Button>
                                </motion.div>
                            )}
                            
                            {!selectedCompanyId && (
                                <div className="text-center text-slate-400 text-sm py-4 italic">
                                    Selecciona una empresa arriba para continuar.
                                </div>
                            )}
                         </form>
                    </TabsContent>

                    {/* REGISTER TAB */}
                    <TabsContent value="register" className="mt-0">
                        {regStep === 1 && (
                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                                <div className="bg-blue-50 p-5 rounded-xl flex gap-3 items-start border border-blue-100">
                                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                                    <div className="text-sm text-blue-800 leading-relaxed">
                                        Para comenzar el registro, ingresa el <strong>NIT</strong> y el <strong>Serial de Autenticación</strong> proporcionados.
                                    </div>
                                </div>
                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <Label>NIT / Documento Empresa Raíz</Label>
                                        <div className="relative">
                                            <Hash className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                                            <input value={rootAuth.doc} onChange={e => setRootAuth({...rootAuth, doc: e.target.value})} className="w-full pl-10 h-12 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: 900123456" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Serial de Autenticación</Label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                                            <input value={rootAuth.serial} onChange={e => setRootAuth({...rootAuth, serial: e.target.value})} className="w-full pl-10 h-12 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" placeholder="Pegar serial..." />
                                        </div>
                                    </div>
                                    <Button onClick={handleStartRegistration} className="w-full bg-slate-900 hover:bg-slate-800 h-12 rounded-xl text-base font-medium">
                                        Validar y Continuar <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                        {regStep === 2 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-6 h-[500px]">
                                <div className="w-full md:w-1/3 flex flex-col border-r pr-6 gap-4">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                                        <Layers className="w-4 h-4" /> Estructura
                                    </h3>
                                    <div className="flex-1 overflow-y-auto border rounded-xl p-3 bg-slate-50/50">
                                        {renderTree()}
                                    </div>
                                    <div className="space-y-2 pt-2">
                                        {isAddingSub ? (
                                            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3 animate-in slide-in-from-bottom-2">
                                                <p className="text-xs font-bold text-slate-500 uppercase">Nueva Sub-empresa</p>
                                                <input className="w-full text-sm p-2.5 border rounded-lg bg-slate-50" placeholder="NIT Sub-empresa" value={newSubData.doc} onChange={e => setNewSubData({...newSubData, doc: e.target.value})} />
                                                <input className="w-full text-sm p-2.5 border rounded-lg bg-slate-50 font-mono" placeholder="Serial Auth" value={newSubData.serial} onChange={e => setNewSubData({...newSubData, serial: e.target.value})} />
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => setIsAddingSub(false)}>Cancelar</Button>
                                                    <Button size="sm" className="flex-1 bg-blue-600" onClick={handleAddSubCompany}>Agregar</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Button variant="outline" className="w-full border-dashed border-slate-300 text-slate-600 h-10" onClick={() => setIsAddingSub(true)}>
                                                <Plus className="w-4 h-4 mr-2" /> Agregar Sub-empresa
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full md:w-2/3 flex flex-col">
                                    <div className="flex-1 overflow-y-auto px-1">
                                        <div className="mb-6 pb-4 border-b flex justify-between items-center">
                                            <div>
                                                <h2 className="text-lg font-bold text-slate-900">Detalles de la Empresa</h2>
                                                <p className="text-sm text-slate-500 font-mono">NIT: {hierarchy.find(n => n.id === selectedNodeId)?.doc}</p>
                                            </div>
                                            {hierarchy.find(n => n.id === selectedNodeId)?.isRoot && (
                                                <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-2 py-1 rounded uppercase tracking-wider">Empresa Matriz</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-5 mb-6">
                                            <div className="space-y-2 col-span-2">
                                                <Label>Nombre de la Empresa / Razón Social</Label>
                                                <div className="relative">
                                                    <Building className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                                                    <input value={formData.name} onChange={e => handleFormChange('name', e.target.value)} className="w-full pl-9 p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nombre..." />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Dirección</Label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                                                    <input value={formData.address} onChange={e => handleFormChange('address', e.target.value)} className="w-full pl-9 p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Calle 123..." />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Teléfono</Label>
                                                <div className="relative">
                                                    <Phone className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                                                    <input value={formData.phone} onChange={e => handleFormChange('phone', e.target.value)} className="w-full pl-9 p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="3001234567" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
                                            <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                                <Lock className="w-3 h-3" /> Credenciales de Acceso
                                            </p>
                                            <div className="space-y-4">
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Usuario Administrador</Label>
                                                    <input value={formData.username} onChange={e => handleFormChange('username', e.target.value)} className="w-full p-2.5 border rounded-lg text-sm bg-white" placeholder="Ej: admin" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-green-700 font-semibold">Clave Maestra</Label>
                                                        <input type="password" value={formData.password} onChange={e => handleFormChange('password', e.target.value)} className="w-full p-2.5 border border-green-200 rounded-lg text-sm bg-white focus:ring-green-500" placeholder="Acceso Total" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-orange-700 font-semibold">Clave Parcial</Label>
                                                        <input type="password" value={formData.partialPassword} onChange={e => handleFormChange('partialPassword', e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg text-sm bg-white focus:ring-orange-500" placeholder="Solo Registro" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-4 mt-4 border-t flex justify-end gap-3">
                                        <Button variant="outline" onClick={() => setRegStep(1)}>Cancelar</Button>
                                        <Button className="bg-green-600 hover:bg-green-700" onClick={handleFinalizeRegistration}>
                                            <Save className="w-4 h-4 mr-2" /> Guardar Registro
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </TabsContent>
                </Tabs>
           </div>
           <div className="bg-slate-50 p-4 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
               &copy; 2026 JaiderHerTur26. Todos los derechos reservados.
           </div>
        </motion.div>
      </div>
    </>
  );
};

export default Login;