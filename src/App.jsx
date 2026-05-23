import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BountyBoard from './BountyBoard'
import Admin from './Admin'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BountyBoard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App