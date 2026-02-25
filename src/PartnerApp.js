import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Truck, BarChart3, LogOut, Package, ArrowRight,
    CheckCircle2, Clock, Navigation, User,
    Leaf, Container, Activity, Zap,
    Layers, Cpu, Hammer, Trash2, Sprout,
    Check, Factory, Stethoscope, Loader2, AlertCircle,
    Map as MapIcon, Target, X,
} from 'lucide-react';

// Firebase
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { registerUser, loginUser, logoutUser } from './firebase/authService';
import { saveAgencyProfile, getAgencyProfile } from './firebase/partnerService';

// ─── Waste type catalog ─────────────────────────────────────────────────────
const WASTE_TYPES = {
    metal: {
        label: 'Metal Waste', icon: Container, color: 'blue',
        theme: 'bg-blue-100 text-blue-700', border: 'hover:border-blue-500',
        metrics: { trucks: 5, tonnage: '45.2t', target: 92 },
        subCategories: [
            { id: 'metals_core', label: 'Metals', icon: Hammer, desc: 'Industrial alloys, steel, and aluminum.' },
            { id: 'scraps_mixed', label: 'Scraps', icon: Trash2, desc: 'Mixed demolition and construction scrap.' },
        ],
    },
    plastic: {
        label: 'Plastic', icon: Layers, color: 'amber',
        theme: 'bg-amber-100 text-amber-700', border: 'hover:border-amber-500',
        metrics: { trucks: 12, tonnage: '8.1t', target: 60 },
    },
    bio: {
        label: 'Bio Waste', icon: Leaf, color: 'emerald',
        theme: 'bg-emerald-100 text-emerald-700', border: 'hover:border-emerald-500',
        metrics: { trucks: 8, tonnage: '12.4t', target: 85 },
    },
    electronic: {
        label: 'E-Waste', icon: Cpu, color: 'purple',
        theme: 'bg-purple-100 text-purple-700', border: 'hover:border-purple-500',
        metrics: { trucks: 3, tonnage: '2.5t', target: 40 },
    },
    industrial: {
        label: 'Industrial Waste', icon: Factory, color: 'slate',
        theme: 'bg-slate-100 text-slate-700', border: 'hover:border-slate-500',
        metrics: { trucks: 10, tonnage: '110.5t', target: 78 },
    },
    agricultural: {
        label: 'Agricultural Waste', icon: Sprout, color: 'green',
        theme: 'bg-green-100 text-green-700', border: 'hover:border-green-500',
        metrics: { trucks: 6, tonnage: '34.2t', target: 88 },
    },
    biomedical: {
        label: 'Biomedical Waste', icon: Stethoscope, color: 'red',
        theme: 'bg-red-100 text-red-700', border: 'hover:border-red-500',
        metrics: { trucks: 4, tonnage: '1.2t', target: 95 },
    },
};

const INITIAL_TASKS = [
    { id: 'TASK-9283', customerName: 'City Hospital', wasteType: 'biomedical', address: 'Block A, Medical Square', time: '09:00 AM', status: 'pending' },
    { id: 'TASK-8811', customerName: 'Valley Farms', wasteType: 'agricultural', address: 'Plot 12, Rural North', time: '08:00 AM', status: 'pending' },
    { id: 'TASK-4412', customerName: 'Steel Works Ltd', wasteType: 'metal', subType: 'metals_core', address: 'Unit 4, Industrial Hub', time: '02:15 PM', status: 'pending' },
    { id: 'TASK-5501', customerName: 'Factory Corp', wasteType: 'industrial', address: 'Pier 47, Manufacturing Zone', time: '04:00 PM', status: 'pending' },
    { id: 'TASK-6610', customerName: 'Tech Park A', wasteType: 'electronic', address: 'B-Block IT Center', time: '11:00 AM', status: 'pending' },
];

// ─── Inline helpers ──────────────────────────────────────────────────────────
const ErrorBanner = ({ message, onDismiss }) => (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 font-bold text-xs px-4 py-3 rounded-lg">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span className="flex-1">{message}</span>
        {onDismiss && <button onClick={onDismiss}><X size={14} /></button>}
    </div>
);

// ─── PartnerApp ──────────────────────────────────────────────────────────────
export default function PartnerApp({ onSwitchPortal }) {
    // ── Auth ─────────────────────────────────────────────────────────────
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [agencyProfile, setAgencyProfile] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authMode, setAuthMode] = useState('login');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);

    // ── Dashboard ─────────────────────────────────────────────────────────
    const [view, setView] = useState('dashboard');
    const [selectedFleet, setSelectedFleet] = useState(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(null);
    const [statusFilter, setStatusFilter] = useState(null);
    const [tasks, setTasks] = useState(INITIAL_TASKS);

    // ── Registration form ─────────────────────────────────────────────────
    const [reg, setReg] = useState({
        agencyName: '', mobile: '', email: '', gst: '',
        street: '', city: '', pincode: '', state: '', coords: '',
        handledWastes: [],
    });
    const [isLocating, setIsLocating] = useState(false);

    // ── Leaflet ───────────────────────────────────────────────────────────
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    // ─── Load Leaflet CSS+JS dynamically ────────────────────────────────────
    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        if (!window.L) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => setLeafletLoaded(true);
            document.head.appendChild(script);
        } else {
            setLeafletLoaded(true);
        }
    }, []);

    // ─── Firebase Auth listener ──────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            setFirebaseUser(fbUser);
            if (fbUser) {
                try {
                    const profile = await getAgencyProfile(fbUser.uid);
                    if (profile) setAgencyProfile(profile);
                } catch (e) { console.error(e); }
            } else {
                setAgencyProfile(null);
            }
            setAuthLoading(false);
        });
        return unsub;
    }, []);

    // ─── Reverse geocoding ────────────────────────────────────────────────────
    const reverseGeocode = useCallback(async (lat, lng) => {
        setIsLocating(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data?.address) {
                setReg(prev => ({
                    ...prev,
                    street: data.address.road || data.address.suburb || data.display_name.split(',')[0] || '',
                    city: data.address.city || data.address.town || data.address.village || '',
                    state: data.address.state || '',
                    pincode: data.address.postcode || '',
                    coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                }));
            }
        } catch (e) { console.error(e); }
        finally { setIsLocating(false); }
    }, []);

    // ─── Leaflet map init ─────────────────────────────────────────────────────
    useEffect(() => {
        if (authMode !== 'signup' || !leafletLoaded || !mapContainerRef.current || mapRef.current) return;
        const timer = setTimeout(() => {
            if (!mapContainerRef.current || mapContainerRef.current._leaflet_id || !window.L) return;
            const L = window.L;
            mapRef.current = L.map(mapContainerRef.current, { zoomControl: false, scrollWheelZoom: false })
                .setView([19.0760, 72.8777], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })
                .addTo(mapRef.current);
            mapRef.current.on('click', (e) => {
                const { lat, lng } = e.latlng;
                if (markerRef.current) mapRef.current.removeLayer(markerRef.current);
                markerRef.current = L.marker(e.latlng, { draggable: true }).addTo(mapRef.current);
                reverseGeocode(lat, lng);
                markerRef.current.on('dragend', ev => {
                    const p = ev.target.getLatLng();
                    reverseGeocode(p.lat, p.lng);
                });
            });
            mapRef.current.invalidateSize();
        }, 500);
        return () => {
            clearTimeout(timer);
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
        };
    }, [authMode, leafletLoaded, reverseGeocode]);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const toggleWasteType = (id) =>
        setReg(prev => ({
            ...prev,
            handledWastes: prev.handledWastes.includes(id)
                ? prev.handledWastes.filter(x => x !== id)
                : [...prev.handledWastes, id],
        }));

    const handleAuth = useCallback(async (e) => {
        e.preventDefault();
        setAuthError('');
        setAuthBusy(true);

        const fd = new FormData(e.target);
        const email = fd.get('email');
        const password = fd.get('password');

        try {
            if (authMode === 'signup') {
                // Create Firebase Auth account
                const { credential } = await registerUser(email, password, {
                    name: reg.agencyName || email.split('@')[0],
                    phone: reg.mobile,
                    area: reg.city,
                    flatNo: '',
                    street: reg.street,
                });
                // Save full agency profile to Firestore
                await saveAgencyProfile(credential.user.uid, {
                    ...reg,
                    email,
                    registeredAt: new Date().toISOString(),
                });
                // Profile will be loaded by onAuthStateChanged
            } else {
                await loginUser(email, password);
            }
        } catch (err) {
            setAuthError(friendlyError(err.code));
        } finally {
            setAuthBusy(false);
        }
    }, [authMode, reg]);

    const handleLogout = async () => {
        await logoutUser();
        setAuthMode('login');
        setAuthError('');
        setView('dashboard');
        setSelectedFleet(null);
        setStatusFilter(null);
    };

    const updateTaskStatus = (id, status) =>
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));

    const handleFleetClick = (key) => {
        setSelectedFleet(key); setSelectedSubCategory(null); setStatusFilter(null); setView('tasks');
    };

    const handleStatClick = (label) => {
        const map = { 'Pending Pickups': 'pending', 'In Transit': 'in-progress', 'Completed (24h)': 'completed' };
        const s = map[label];
        if (s) { setStatusFilter(s); setSelectedFleet(null); setSelectedSubCategory(null); setView('tasks'); }
    };

    const getVisibleTypes = () => {
        const portfolio = agencyProfile?.handledWastes || reg.handledWastes;
        if (!portfolio?.length) return Object.entries(WASTE_TYPES);
        return Object.entries(WASTE_TYPES).filter(([k]) => portfolio.includes(k));
    };

    function friendlyError(code) {
        const m = {
            'auth/email-already-in-use': 'This email is already registered. Try logging in.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-credential': 'Incorrect email or password.',
            'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
        };
        return m[code] || 'An error occurred. Please try again.';
    }

    // ─── Render: Loading ──────────────────────────────────────────────────────
    if (authLoading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center gap-4 flex-col">
            <Loader2 className="animate-spin text-emerald-500" size={36} />
            <p className="text-slate-400 font-bold text-sm">Connecting…</p>
        </div>
    );

    // ─── Render: Auth ─────────────────────────────────────────────────────────
    if (!firebaseUser) return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
            <div className="w-full max-w-[440px] flex flex-col gap-3 animate-in zoom-in-95 duration-500">
                {/* Switch portal link */}
                <button onClick={onSwitchPortal} className="text-left text-[11px] font-bold text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1.5 mb-1">
                    <ArrowRight size={12} className="rotate-180" /> Switch to Customer Portal
                </button>

                <div className="bg-white border border-slate-200 px-8 py-10 flex flex-col items-center rounded-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="p-1.5 bg-emerald-500 rounded-lg shadow-sm"><Truck className="text-white w-6 h-6" /></div>
                        <span className="text-2xl font-black tracking-tighter uppercase italic">NEX <span className="text-emerald-500">WASTE</span></span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Partner Agency Portal</p>

                    <form onSubmit={handleAuth} className="w-full flex flex-col gap-2.5">
                        {authError && <ErrorBanner message={authError} onDismiss={() => setAuthError('')} />}

                        {authMode === 'signup' && (
                            <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                                <input type="text" placeholder="Agency Name" required
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none"
                                    value={reg.agencyName} onChange={e => setReg({ ...reg, agencyName: e.target.value })} />
                                <input type="tel" placeholder="Mobile Number (10 Digits)" required maxLength={10}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none"
                                    value={reg.mobile} onChange={e => setReg({ ...reg, mobile: e.target.value.replace(/\D/g, '') })} />
                                <input type="text" placeholder="GST Identification Number" required
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none uppercase"
                                    value={reg.gst} onChange={e => setReg({ ...reg, gst: e.target.value })} />

                                {/* Map pin */}
                                <div className="mt-2 border border-slate-200 rounded-sm overflow-hidden bg-slate-50">
                                    <div className="bg-white border-b border-slate-200 flex items-center justify-between p-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <MapIcon size={12} className="text-emerald-500" /> Logistics Hub Pin
                                        </p>
                                        {isLocating && <Loader2 size={12} className="animate-spin text-emerald-500" />}
                                    </div>
                                    <div className="relative">
                                        <div ref={mapContainerRef} style={{ height: '110px' }} className="z-0 grayscale hover:grayscale-0 transition-all duration-700 bg-slate-100" />
                                        {!reg.coords && (
                                            <div className="absolute inset-0 bg-black/5 flex items-center justify-center pointer-events-none">
                                                <div className="bg-white/90 shadow-xl px-3 py-1 rounded-full flex items-center gap-2">
                                                    <Target size={12} className="text-red-500 animate-pulse" />
                                                    <span className="text-[8px] font-black text-slate-600 uppercase">Tap to Pin Hub</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                                        <input type="text" placeholder="Street Address" readOnly value={reg.street}
                                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs outline-none" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" placeholder="City" readOnly value={reg.city}
                                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs outline-none" />
                                            <input type="text" placeholder="Pincode" readOnly value={reg.pincode}
                                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-xs outline-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Waste portfolio */}
                                <div className="mt-2 mb-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Waste Portfolio Managed</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {Object.entries(WASTE_TYPES).map(([id, cfg]) => (
                                            <button key={id} type="button" onClick={() => toggleWasteType(id)}
                                                className={`flex items-center justify-between px-2 py-1.5 rounded-sm border text-[9px] font-bold transition-all ${reg.handledWastes.includes(id)
                                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 shadow-sm'
                                                    }`}>
                                                <span className="truncate">{cfg.label}</span>
                                                {reg.handledWastes.includes(id) && <Check size={10} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <input name="email" type="email" placeholder="Email address" required
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none" />
                        <input name="password" type="password" placeholder="Password" required minLength={6}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs focus:border-slate-400 outline-none" />

                        <button type="submit" disabled={authBusy || isLocating}
                            className="w-full mt-4 py-2.5 bg-emerald-500 text-white rounded-md font-bold text-sm hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
                            {authBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                            {authMode === 'login' ? 'Log in' : 'Complete Registration'}
                        </button>
                    </form>
                </div>

                <div className="bg-white border border-slate-200 py-6 flex items-center justify-center rounded-sm shadow-sm">
                    <p className="text-sm text-slate-600">
                        {authMode === 'login' ? 'New provider?' : 'Existing agency?'}{' '}
                        <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
                            className="text-emerald-600 font-bold hover:underline">
                            {authMode === 'login' ? 'Sign up' : 'Log in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );

    // ─── Render: Dashboard ────────────────────────────────────────────────────
    const portfolio = agencyProfile?.handledWastes || [];
    const visibleTypes = getVisibleTypes();

    const filteredTasks = (tasks) => tasks.filter(t => {
        const matchesFleet = !selectedFleet || t.wasteType === selectedFleet;
        const matchesStatus = !statusFilter || t.status === statusFilter;
        const matchesPortfolio = !portfolio.length || portfolio.includes(t.wasteType);
        const matchesSub = !selectedSubCategory || t.subType === selectedSubCategory;
        return matchesFleet && matchesStatus && matchesPortfolio && matchesSub;
    });

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans animate-in fade-in duration-700">
            {/* Nav */}
            <nav className="flex items-center justify-between px-6 md:px-12 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-xl">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500 rounded-lg shadow-inner shadow-black/20"><Truck className="text-white w-5 h-5" /></div>
                    <span className="text-xl font-black text-white tracking-tighter uppercase italic">NEX <span className="text-emerald-500 font-bold">WASTE</span></span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Center</p>
                        <p className="text-xs font-bold text-white uppercase truncate max-w-[120px]">{agencyProfile?.agencyName || 'HUB-LOGISTICS'}</p>
                    </div>
                    <button onClick={onSwitchPortal} className="hidden md:flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-emerald-400 transition-colors uppercase tracking-widest">
                        <ArrowRight size={12} className="rotate-180" /> Customer
                    </button>
                    <button onClick={handleLogout} className="p-2.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl transition-colors shadow-inner active:scale-90">
                        <LogOut size={20} />
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto p-6 md:p-12 w-full flex-grow">
                {view === 'dashboard' ? (
                    <>
                        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div>
                                <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-2">Logistics Hub</h1>
                                <p className="text-slate-500 font-semibold italic">Welcome back, {agencyProfile?.agencyName || firebaseUser?.email?.split('@')[0]}.</p>
                            </div>
                            <div className="bg-white px-6 py-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer">
                                <BarChart3 className="text-emerald-500" size={28} />
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
                                    <p className="text-2xl font-black text-slate-900">92.4%</p>
                                </div>
                            </div>
                        </header>

                        {/* Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                            {[
                                { label: 'Pending Pickups', val: tasks.filter(t => t.status === 'pending' && (!portfolio.length || portfolio.includes(t.wasteType))).length, color: 'text-amber-500', icon: Clock },
                                { label: 'In Transit', val: tasks.filter(t => t.status === 'in-progress' && (!portfolio.length || portfolio.includes(t.wasteType))).length, color: 'text-emerald-600', icon: Activity },
                                { label: 'Completed (24h)', val: tasks.filter(t => t.status === 'completed' && (!portfolio.length || portfolio.includes(t.wasteType))).length + 15, color: 'text-blue-600', icon: CheckCircle2 },
                            ].map((stat, i) => (
                                <div key={i} onClick={() => handleStatClick(stat.label)}
                                    className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all border-b-4 hover:border-emerald-500 cursor-pointer active:scale-95">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                                        <stat.icon className={`${stat.color} opacity-40 group-hover:opacity-100 transition-opacity`} size={20} />
                                    </div>
                                    <p className={`text-5xl font-black ${stat.color}`}>{stat.val}</p>
                                    <div className="mt-4 flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                        View Queue <ArrowRight size={12} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Fleet verticals */}
                        <h2 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
                            <Zap className="text-emerald-500" size={24} /> Registered Fleet Verticals
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                            {visibleTypes.map(([key, cfg]) => (
                                <div key={key} onClick={() => handleFleetClick(key)}
                                    className={`p-6 bg-white border border-slate-200 rounded-[2rem] ${cfg.border} hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col`}>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className={`p-3 ${cfg.theme} rounded-2xl w-fit group-hover:rotate-6 transition-transform shadow-sm`}><cfg.icon size={24} /></div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">Load</span>
                                            <div className="text-lg font-black text-slate-900">{cfg.metrics.target}%</div>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 mb-1">{cfg.label}</h3>
                                    <div className="w-full h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden shadow-inner">
                                        <div className={`h-full bg-${cfg.color}-500 transition-all duration-1000`} style={{ width: `${cfg.metrics.target}%` }} />
                                    </div>
                                    <div className={`mt-auto flex items-center justify-between font-black text-[10px] uppercase tracking-widest text-${cfg.color}-600 group-hover:translate-x-1 transition-transform`}>
                                        <span>Manage Vertical</span><ArrowRight size={14} />
                                    </div>
                                    <div className={`absolute -right-10 -bottom-10 w-24 h-24 bg-${cfg.color}-500/5 rounded-full blur-2xl`} />
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    /* ── Task queue view ── */
                    <section className="animate-in slide-in-from-right-8 fade-in duration-500">
                        <div className="flex items-center gap-4 mb-10">
                            <button
                                onClick={() => {
                                    if (selectedSubCategory) { setSelectedSubCategory(null); }
                                    else { setView('dashboard'); setSelectedFleet(null); setStatusFilter(null); }
                                }}
                                className="p-4 bg-white border border-slate-200 rounded-[1.5rem] hover:bg-slate-50 transition-colors shadow-sm active:scale-95">
                                <ArrowRight size={20} className="rotate-180" />
                            </button>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
                                    {selectedFleet
                                        ? WASTE_TYPES[selectedFleet].label
                                        : statusFilter === 'pending' ? 'Pending Orders'
                                            : statusFilter === 'in-progress' ? 'In Transit Orders'
                                                : statusFilter === 'completed' ? 'Completed History'
                                                    : 'Order Management'}
                                    {selectedSubCategory && ` › ${WASTE_TYPES[selectedFleet].subCategories.find(s => s.id === selectedSubCategory)?.label}`}
                                </h2>
                                <p className="text-slate-500 font-semibold uppercase text-xs tracking-widest mt-1">Live Routing Control</p>
                            </div>
                        </div>

                        {/* Sub-categories */}
                        {selectedFleet && WASTE_TYPES[selectedFleet].subCategories && !selectedSubCategory ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {WASTE_TYPES[selectedFleet].subCategories.map(sub => (
                                    <div key={sub.id} onClick={() => setSelectedSubCategory(sub.id)}
                                        className={`bg-white p-8 rounded-[2.5rem] border-2 border-slate-50 hover:border-${WASTE_TYPES[selectedFleet].color}-500 cursor-pointer transition-all hover:shadow-2xl group relative overflow-hidden`}>
                                        <div className={`p-4 bg-${WASTE_TYPES[selectedFleet].color}-50 text-${WASTE_TYPES[selectedFleet].color}-600 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform shadow-md shadow-black/5`}>
                                            <sub.icon size={32} />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 mb-2">{sub.label}</h3>
                                        <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed italic">{sub.desc}</p>
                                        <div className={`flex items-center gap-2 text-[10px] font-black text-${WASTE_TYPES[selectedFleet].color}-600 uppercase tracking-widest`}>
                                            Open Logistics Queue <ArrowRight size={14} />
                                        </div>
                                        <div className={`absolute -right-8 -bottom-8 w-32 h-32 bg-${WASTE_TYPES[selectedFleet].color}-500/5 rounded-full blur-2xl`} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* Task cards */
                            <div className="space-y-6">
                                {filteredTasks(tasks).length === 0 ? (
                                    <div className="bg-white border-4 border-dashed border-slate-100 rounded-[3rem] p-24 text-center">
                                        <Package className="mx-auto text-slate-100 mb-6" size={80} />
                                        <p className="text-slate-400 font-black text-xl italic uppercase tracking-widest">No Active Orders Found</p>
                                    </div>
                                ) : (
                                    filteredTasks(tasks).map(task => (
                                        <div key={task.id}
                                            className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col md:flex-row group hover:shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-right-4">
                                            <div className={`w-3 md:w-5 ${task.status === 'completed' ? 'bg-blue-600 shadow-[inset_-2px_0_10px_rgba(0,0,0,0.1)]' :
                                                task.status === 'in-progress' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                                                }`} />
                                            <div className="flex-1 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-12">
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex items-center gap-4">
                                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${WASTE_TYPES[task.wasteType].theme} shadow-sm ring-1 ring-black/5`}>
                                                            {WASTE_TYPES[task.wasteType].label}
                                                            {task.subType && WASTE_TYPES[task.wasteType].subCategories &&
                                                                ` • ${WASTE_TYPES[task.wasteType].subCategories.find(s => s.id === task.subType)?.label}`}
                                                        </span>
                                                        <span className="text-xs text-slate-300 font-black tracking-[0.2em] font-mono">REF: {task.id}</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-3xl font-black text-slate-900 leading-tight mb-2 group-hover:text-emerald-600 transition-colors tracking-tight">{task.address}</h3>
                                                        <p className="text-sm text-slate-500 flex items-center gap-2 font-bold">
                                                            <User size={18} className="text-slate-300" /> Client: <span className="text-slate-900 font-black">{task.customerName}</span>
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-slate-200 pl-3">
                                                        <Clock size={16} className="text-slate-200" /> Window: {task.time}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-3 min-w-[240px]">
                                                    {task.status === 'pending' &&
                                                        <button onClick={() => updateTaskStatus(task.id, 'in-progress')}
                                                            className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl hover:bg-emerald-600 transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-slate-200">
                                                            <Truck size={16} /> Accept Order
                                                        </button>}
                                                    {task.status === 'in-progress' &&
                                                        <button onClick={() => updateTaskStatus(task.id, 'completed')}
                                                            className="w-full py-5 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest active:scale-95 shadow-xl shadow-emerald-200">
                                                            <CheckCircle2 size={18} /> Confirm Handover
                                                        </button>}
                                                    {task.status === 'completed' &&
                                                        <div className="w-full py-5 bg-slate-50 text-slate-300 font-black rounded-2xl text-center flex items-center justify-center gap-2 text-[10px] tracking-widest uppercase border border-slate-100 italic">
                                                            <CheckCircle2 size={18} /> Logged
                                                        </div>}
                                                    <button className="w-full py-4 border-2 border-slate-100 text-slate-400 font-black rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest">
                                                        <Navigation size={18} /> Track
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
