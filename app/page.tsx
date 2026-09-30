'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, ChevronRight, ClipboardList, FileText, Heart, LayoutDashboard, LogIn, PawPrint, Plus, Settings, Sparkles, Stethoscope, Syringe, Utensils, Weight, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Pet = { id: string; name: string; species: string; breed: string | null; weight_kg: number | null; color: string | null }
type Appointment = { id: string; title: string; scheduled_at: string; location: string | null; completed: boolean; pet_id: string }
type CareLog = { id: string; title: string; care_type: string; logged_at: string; pet_id: string }

const careIcons: Record<string, typeof Syringe> = { vet: Stethoscope, food: Utensils, weight: Weight, default: Heart }

export default function Page() {
  const router = useRouter()
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const [user, setUser] = useState<{ email?: string} | null>(null)
  const [pets, setPets] = useState<Pet[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [careLogs, setCareLogs] = useState<CareLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [petModalMode, setPetModalMode] = useState<'add' | 'edit'>('add')
  const [editingPetId, setEditingPetId] = useState<string | null>(null)
  const [newPet, setNewPet] = useState({ name: '', breed: '', species: 'dog', weight_kg: '' })
  const [saving, setSaving] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfilePhoto(null)
    window.localStorage.removeItem('profile-photo')
    setUser(null)
    setPets([])
    setAppointments([])
    setCareLogs([])
    setLoading(false)
    router.push('/auth/login')
  }

  useEffect(() => {
    const savedPhoto = window.localStorage.getItem('profile-photo')
    if (savedPhoto) setProfilePhoto(savedPhoto)

    const client = createClient()
    setSupabase(client)

    let isMounted = true
    let channel: ReturnType<typeof client.channel> | undefined

    async function load() {
      const { data: { user } } = await client.auth.getUser()
      if (!isMounted) return

      setUser(user)
      if (!user) {
        setLoading(false)
        return
      }

      const [petResult, appointmentResult, logResult] = await Promise.all([
        client.from('pets').select('id,name,species,breed,weight_kg,color').order('created_at', { ascending: false }),
        client.from('appointments').select('id,title,scheduled_at,location,completed,pet_id').eq('completed', false).order('scheduled_at').limit(4),
        client.from('care_logs').select('id,title,care_type,logged_at,pet_id').order('logged_at', { ascending: false }).limit(5),
      ])

      if (!isMounted) return

      setPets(petResult.data ?? [])
      setAppointments(appointmentResult.data ?? [])
      setCareLogs(logResult.data ?? [])
      setLoading(false)
    }

    channel = client.channel('pet-care-updates')
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pets' }, () => {
        void load()
      })
      .subscribe()

    void load()

    return () => {
      isMounted = false
      if (channel) {
        void client.removeChannel(channel)
      }
    }
  }, [])

  function openAddPetModal() {
    setPetModalMode('add')
    setEditingPetId(null)
    setNewPet({ name: '', breed: '', species: 'dog', weight_kg: '' })
    setShowAdd(true)
  }

  function openEditPetModal(pet?: Pet) {
    const selectedPet = pet ?? pets[0]
    if (!selectedPet) {
      openAddPetModal()
      return
    }

    setPetModalMode('edit')
    setEditingPetId(selectedPet.id)
    setNewPet({
      name: selectedPet.name,
      breed: selectedPet.breed ?? '',
      species: selectedPet.species || 'dog',
      weight_kg: selectedPet.weight_kg != null ? String(selectedPet.weight_kg) : '',
    })
    setShowAdd(true)
  }

  async function savePet(event: React.FormEvent) {
    event.preventDefault(); if (!newPet.name.trim() || !supabase) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      return
    }

    const petPayload = {
      name: newPet.name.trim(),
      species: newPet.species,
      breed: newPet.breed.trim() || null,
      weight_kg: newPet.weight_kg === '' ? null : Number(newPet.weight_kg),
      owner_id: user.id,
    }

    if (petModalMode === 'edit' && editingPetId) {
      const { data } = await supabase.from('pets').update(petPayload).eq('id', editingPetId).select('id,name,species,breed,weight_kg,color').single()
      if (data) {
        setPets((currentPets) => currentPets.map((pet) => pet.id === data.id ? { ...pet, ...data } : pet))
      }
    } else {
      const { data } = await supabase.from('pets').insert(petPayload).select('id,name,species,breed,weight_kg,color').single()
      if (data) setPets((currentPets) => [data, ...currentPets])
    }

    setNewPet({ name: '', breed: '', species: 'dog', weight_kg: '' })
    setEditingPetId(null)
    setPetModalMode('add')
    setShowAdd(false)
    setSaving(false)
  }

  async function deletePet() {
    if (!supabase || !editingPetId) return

    setSaving(true)
    await supabase.from('pets').delete().eq('id', editingPetId)

    setPets((currentPets) => currentPets.filter((pet) => pet.id !== editingPetId))
    setShowAdd(false)
    setEditingPetId(null)
    setPetModalMode('add')
    setNewPet({ name: '', breed: '', species: 'dog', weight_kg: '' })
    setSaving(false)
  }

  function handleProfilePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (!result) return
      setProfilePhoto(result)
      window.localStorage.setItem('profile-photo', result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const petName = (id: string) => pets.find((pet) => pet.id === id)?.name ?? 'Tu mascota'
  const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value))
  const timeLabel = (value: string) => new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><PawPrint size={20} /></span><span>nido</span></div>
      <nav className="nav" aria-label="Navegación principal">
        <a className="nav-link active" href="#inicio"><LayoutDashboard size={18} /> Inicio</a><a className="nav-link" href="#mascotas"><PawPrint size={18} /> Mis mascotas <span className="nav-count">{pets.length}</span></a><a className="nav-link" href="#calendario"><CalendarDays size={18} /> Calendario</a><a className="nav-link" href="#historial"><ClipboardList size={18} /> Historial</a><a className="nav-link" href="#documentos"><FileText size={18} /> Documentos</a>
      </nav>
      <div className="sidebar-bottom"><a className="nav-link" href="#ajustes"><Settings size={18} /> Ajustes</a><div className="help-card"><Sparkles size={17} /><strong>Cuida mejor,<br />vive más.</strong><span>Todo lo que tu mascota necesita, en un solo lugar.</span></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div className="mobile-brand brand"><span className="brand-mark"><PawPrint size={18} /></span>nido</div><div className="topbar-right"><span className="status-dot" /> {user ? user.email : 'Modo vista previa'}<div><input ref={fileInputRef} type="file" accept="image/*" onChange={handleProfilePhotoUpload} style={{ display: 'none' }} /><button type="button" className="avatar" aria-label="Cambiar foto de perfil" onClick={() => fileInputRef.current?.click()}>{profilePhoto ? <img src={profilePhoto} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : (user?.email?.[0]?.toUpperCase() ?? 'T')}</button></div>{user && <button className="text-button" onClick={signOut}>Cerrar sesión</button>}</div></header>
      <div className="page-body" id="inicio">
        <div className="welcome"><div><p className="eyebrow">MARTES, 16 DE SEPTIEMBRE</p><h1>Hola, {user?.email?.split('@')[0] ?? 'bienvenido'} <span className="wave">✦</span></h1><p className="muted">Un pequeño resumen del bienestar de tu familia.</p></div>{!user && <a className="login-button" href="/auth/login"><LogIn size={16} /> Iniciar sesión</a>}</div>
        {!user && <div className="notice"><div className="notice-icon"><PawPrint size={21} /></div><div><strong>Tu espacio de cuidado</strong><p>Inicia sesión para guardar mascotas, citas y documentos de forma segura.</p></div><a href="/auth/sign-up">Crear cuenta <ChevronRight size={16} /></a></div>}
        <div className="section-heading"><div><h2>Resumen</h2><p className="muted">Lo importante, de un vistazo.</p></div><button className="primary-button" onClick={() => openAddPetModal()}><Plus size={17} /> Añadir mascota</button></div>
        <div className="stats-grid"><div className="stat-card coral"><div className="stat-top"><span className="stat-icon"><PawPrint size={18} /></span><span>Este mes</span></div><strong>{pets.length}</strong><p>Mascotas registradas</p></div><div className="stat-card mint"><div className="stat-top"><span className="stat-icon"><CalendarDays size={18} /></span><span>Próximamente</span></div><strong>{appointments.length}</strong><p>Citas pendientes</p></div><div className="stat-card cream"><div className="stat-top"><span className="stat-icon"><Heart size={18} /></span><span>Últimos 7 días</span></div><strong>{careLogs.length}</strong><p>Registros de cuidado</p></div></div>
        <div className="dashboard-grid"><section className="panel" id="mascotas"><div className="panel-heading"><div><h2>Mis mascotas</h2><p className="muted">Su salud empieza aquí.</p></div></div>{loading ? <div className="empty">Cargando tus mascotas...</div> : pets.length === 0 ? <div className="empty"><div className="empty-paw"><PawPrint size={24} /></div><strong>Aún no tienes mascotas</strong><span>Añade la primera para empezar su historia.</span><button className="outline-button" onClick={() => openAddPetModal()}>Añadir mascota</button></div> : <div className="pet-list">{pets.slice(0, 3).map((pet) => <div className="pet-row" key={pet.id}><div className="pet-avatar"><PawPrint size={21} /></div><div className="pet-info"><strong>{pet.name}</strong><span>{pet.breed || (pet.species === 'cat' ? 'Gato' : 'Perro')}</span></div><span className="pet-weight">{pet.weight_kg ? `${pet.weight_kg} kg` : 'Sin peso'}</span><button type="button" className="text-button" aria-label={`Editar ${pet.name}`} onClick={() => openEditPetModal(pet)}>Editar</button></div>)}</div>}</section>
          <section className="panel" id="calendario"><div className="panel-heading"><div><h2>Próximas citas</h2><p className="muted">No te pierdas nada.</p></div><button className="icon-button" aria-label="Añadir cita"><Plus size={18} /></button></div>{appointments.length === 0 ? <div className="empty compact"><CalendarDays size={23} /><span>No hay citas pendientes.</span></div> : <div className="appointment-list">{appointments.map((item) => <div className="appointment-row" key={item.id}><div className="date-box"><strong>{new Date(item.scheduled_at).getDate()}</strong><span>{new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(item.scheduled_at))}</span></div><div><strong>{item.title}</strong><span>{petName(item.pet_id)} · {timeLabel(item.scheduled_at)}</span></div><Check size={17} className="check" /></div>)}</div>}</section></div>
        <section className="activity panel" id="historial"><div className="panel-heading"><div><h2>Actividad reciente</h2><p className="muted">El día a día de tus mascotas.</p></div><button className="text-button">Ver historial <ChevronRight size={16} /></button></div>{careLogs.length === 0 ? <div className="empty compact"><ClipboardList size={23} /><span>Tu actividad aparecerá aquí.</span></div> : <div className="activity-list">{careLogs.map((item) => { const Icon = careIcons[item.care_type] ?? careIcons.default; return <div className="activity-row" key={item.id}><span className="activity-icon"><Icon size={17} /></span><div><strong>{item.title}</strong><span>{petName(item.pet_id)} · {dateLabel(item.logged_at)}</span></div></div>})}</div>}</section>
      </div>
    </section>
    {showAdd && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => { setShowAdd(false); setPetModalMode('add'); setEditingPetId(null); setNewPet({ name: '', breed: '', species: 'dog', weight_kg: '' }) }} aria-label="Cerrar"><X size={18} /></button><div className="modal-icon"><PawPrint size={23} /></div><h2 id="add-title">{petModalMode === 'edit' ? 'Editar mascota' : 'Añadir mascota'}</h2><p className="muted">{petModalMode === 'edit' ? 'Actualiza los datos de tu mascota.' : 'Crea un perfil para llevar su cuidado al día.'}</p><form onSubmit={savePet}><label>Nombre<input autoFocus value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} placeholder="Luna" required /></label><label>Especie<select value={newPet.species} onChange={(e) => setNewPet({ ...newPet, species: e.target.value })}><option value="dog">Perro</option><option value="cat">Gato</option><option value="other">Otro</option></select></label><label>Raza <span className="optional">Opcional</span><input value={newPet.breed} onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })} placeholder="Golden retriever" /></label><label>Peso (kg) <span className="optional">Opcional</span><input type="number" step="0.1" min="0" value={newPet.weight_kg} onChange={(e) => setNewPet({ ...newPet, weight_kg: e.target.value })} placeholder="12.5" /></label><button className="primary-button full" disabled={saving}>{saving ? 'Guardando...' : petModalMode === 'edit' ? 'Guardar cambios' : 'Guardar mascota'}</button>{petModalMode === 'edit' && editingPetId && <button type="button" className="outline-button full" style={{ marginTop: '12px' }} disabled={saving} onClick={deletePet}>Eliminar mascota</button>}</form></div></div>}
  </main>
}
