// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import QuickAdd from "../components/QuickAdd";
import TaskCard from "../components/TaskCard";
import { seedData } from "../data/seed";
import { useStore } from "../store";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  const data = seedData();
  data.onboarded = true;
  useStore.setState({
    data,
    past: [],
    future: [],
    toast: "",
    storageError: false,
  });
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  window.scrollTo = vi.fn();
});
afterEach(cleanup);
describe("Creación desde la interfaz", () => {
  it("la flecha de pasar la pelota reasigna sin abrir un panel", async () => {
    const user = userEvent.setup();
    const task = useStore.getState().data.tasks[0];
    const onOpen = vi.fn();
    render(<TaskCard task={task} onOpen={onOpen} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Pasar la pelota" }));
    expect(useStore.getState().data.tasks[0].assignee).not.toBe(task.assignee);
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("el botón Añadir guarda, limpia el campo y permite otra tarea", async () => {
    const user = userEvent.setup();
    const board = useStore.getState().data.boards[0];
    const created = vi.fn();
    render(
      <QuickAdd
        boardId={board.id}
        columnId={board.columns[0].id}
        onCreated={created}
      />,
    );
    const input = screen.getByLabelText("Crear tarea rápidamente");
    await user.type(input, "Comprar café");
    await user.click(screen.getByRole("button", { name: "Crear tarea" }));
    expect(
      useStore.getState().data.tasks.some((t) => t.title === "Comprar café"),
    ).toBe(true);
    expect((input as HTMLInputElement).value).toBe("");
    expect(created).toHaveBeenCalledOnce();
    await user.type(input, "Llevar las ideas{Enter}");
    expect(
      useStore
        .getState()
        .data.tasks.some((t) => t.title === "Llevar las ideas"),
    ).toBe(true);
  });
  it("despeja los filtros al añadir para que la tarjeta no parezca perdida", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Filtrar tareas" }));
    await user.selectOptions(screen.getByLabelText("Persona"), "vale");
    const main = within(screen.getByRole("main"));
    await user.type(
      main.getByLabelText("Crear tarea rápidamente"),
      "Una tarea que debo ver",
    );
    await user.click(main.getByRole("button", { name: "Crear tarea" }));
    await screen.findByRole("heading", { name: "Una tarea que debo ver" });
    expect((screen.getByLabelText("Persona") as HTMLSelectElement).value).toBe(
      "all",
    );
  });
  it("captura una tarea con persona, fecha y etiquetas elegidas en sus controles", async () => {
    const user = userEvent.setup();
    const board = useStore.getState().data.boards[0];
    render(<QuickAdd boardId={board.id} columnId={board.columns[0].id} />);
    await user.selectOptions(screen.getByLabelText("Asignar a"), "vale");
    const date = screen.getByLabelText("Fecha rápida") as HTMLSelectElement;
    const tomorrow = Array.from(date.options).find((option) => option.label === "Mañana")!.value;
    await user.selectOptions(date, tomorrow);
    await user.click(screen.getByText("Etiquetas", { exact: true }));
    await user.type(screen.getByLabelText("Etiquetas separadas por comas"), "Producción, #Editorial");
    await user.type(screen.getByLabelText("Crear tarea rápidamente"), "Ajustar portada #urgente{Enter}");
    expect(useStore.getState().data.tasks.find((task) => task.title === "Ajustar portada")).toMatchObject({
      assignee: "vale",
      due: tomorrow,
      priority: "urgente",
      tags: ["Producción", "Editorial"],
    });
  });
  it("crear desde Mi día vuelve al tablero y muestra una tarea sin fecha", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Navegación principal" }),
      ).getByRole("button", { name: /Mi día/ }),
    );
    await user.type(
      screen.getByLabelText("Crear tarea rápidamente"),
      "Idea sin fecha{Enter}",
    );
    await screen.findByRole("heading", { name: "Idea sin fecha" });
    expect(
      screen
        .getByRole("tab", { name: "Tablero" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });
  it("el botón móvil abre un formulario y guarda en la columna elegida", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(container.querySelector(".mobile-create")!);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(
      dialog.getByLabelText("Título de la nueva tarea"),
      "Algo desde el celular",
    );
    const board = useStore.getState().data.boards[0];
    await user.selectOptions(
      dialog.getByLabelText("Columna de destino"),
      board.columns[1].id,
    );
    await user.click(dialog.getByRole("button", { name: "Añadir tarea" }));
    await screen.findByRole("heading", { name: "Algo desde el celular" });
    expect(
      useStore
        .getState()
        .data.tasks.find((t) => t.title === "Algo desde el celular")?.columnId,
    ).toBe(board.columns[1].id);
  });
  it("el formulario de columna guarda en esa columna y puede cerrarse explícitamente", async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = screen.getByRole("heading", { name: "En revisión" });
    const add = screen.getByRole("button", { name: "Añadir a En revisión" });
    expect(title.closest(".column-heading")?.contains(add)).toBe(false);
    expect(add.closest(".column-tools")).not.toBeNull();
    await user.click(add);
    const composer = within(document.querySelector(".inline-composer")!);
    await user.type(
      composer.getByLabelText("Crear tarea rápidamente"),
      "Revisar en equipo",
    );
    await user.click(composer.getByRole("button", { name: "Crear tarea" }));
    await screen.findByRole("heading", { name: "Revisar en equipo" });
    const board = useStore.getState().data.boards[0];
    expect(
      useStore
        .getState()
        .data.tasks.find((t) => t.title === "Revisar en equipo")?.columnId,
    ).toBe(board.columns[2].id);
    await user.click(composer.getByRole("button", { name: "Cerrar" }));
    expect(document.querySelector(".inline-composer")).toBeNull();
  });
  it("doble clic permite editar la tarjeta sin abrir el detalle", async () => {
    const user = userEvent.setup();
    const task = useStore.getState().data.tasks[0];
    const onOpen = vi.fn();
    render(<TaskCard task={task} onOpen={onOpen} onComplete={vi.fn()} />);
    await user.dblClick(screen.getByRole("heading", { name: task.title }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Título editado{Enter}");
    await waitFor(() =>
      expect(useStore.getState().data.tasks[0].title).toBe("Título editado"),
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
});
