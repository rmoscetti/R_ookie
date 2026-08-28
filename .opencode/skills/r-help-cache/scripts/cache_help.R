args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 1L || !nzchar(args[[1L]])) {
  stop(
    "Usage: cache_help.R <topic> [package|AUTO] [project_root]",
    call. = FALSE
  )
}

topic <- trimws(args[[1L]])
topic <- sub("\\s*\\(\\s*\\)\\s*$", "", topic, perl = TRUE)

if (!nzchar(topic)) {
  stop("The help topic is empty after normalization.", call. = FALSE)
}

package_arg <- if (length(args) >= 2L) trimws(args[[2L]]) else "AUTO"
project_root <- if (length(args) >= 3L && nzchar(args[[3L]])) args[[3L]] else getwd()

project_root <- normalizePath(project_root, winslash = "/", mustWork = TRUE)
cache_root <- file.path(project_root, "wiki", "r-help")

if (!dir.exists(file.path(project_root, "wiki"))) {
  stop("The supplied project root does not contain a wiki/ directory.", call. = FALSE)
}

dir.create(cache_root, recursive = TRUE, showWarnings = FALSE)

safe_slug <- function(x) {
  codepoints <- utf8ToInt(enc2utf8(x))
  pieces <- vapply(
    codepoints,
    function(cp) {
      ch <- intToUtf8(cp)
      if (grepl("^[A-Za-z0-9._-]$", ch)) {
        ch
      } else {
        sprintf("_u%04X", cp)
      }
    },
    character(1L)
  )
  paste0(pieces, collapse = "")
}

package_from_help_path <- function(path) {
  parts <- strsplit(gsub("\\\\", "/", path), "/", fixed = FALSE)[[1L]]
  help_positions <- which(parts == "help")
  if (length(help_positions) == 0L || help_positions[[length(help_positions)]] <= 1L) {
    return(NA_character_)
  }
  parts[[help_positions[[length(help_positions)]] - 1L]]
}

strip_overstrike <- function(lines) {
  lines <- enc2utf8(lines)
  repeat {
    cleaned <- gsub(".\\x08", "", lines, perl = TRUE)
    if (identical(cleaned, lines)) break
    lines <- cleaned
  }
  gsub("[[:space:]]+$", "", lines, perl = TRUE)
}

escape_fence <- function(lines) {
  gsub("````", "` ` ` `", lines, fixed = TRUE)
}

normalize_ws <- function(x) {
  x <- paste(enc2utf8(x), collapse = " ")
  x <- gsub("[[:space:]]+", " ", x, perl = TRUE)
  trimws(x)
}

truncate_text <- function(x, max_chars) {
  x <- normalize_ws(x)
  if (!nzchar(x) || nchar(x, type = "chars") <= max_chars) return(x)
  paste0(substr(x, 1L, max_chars - 1L), "…")
}

markdown_cell <- function(x, max_chars = Inf) {
  x <- normalize_ws(x)
  if (is.finite(max_chars)) x <- truncate_text(x, max_chars)
  x <- gsub("\\|", "\\\\|", x, perl = TRUE)
  if (!nzchar(x)) " " else x
}

comment_value <- function(x) {
  x <- normalize_ws(x)
  gsub("-->", "-- >", x, fixed = TRUE)
}

extract_marker_value <- function(line, key) {
  pattern <- paste0(".* ", key, "=\\\"([^\\\"]*)\\\".*")
  if (!grepl(pattern, line, perl = TRUE)) return(NA_character_)
  sub(pattern, "\\1", line, perl = TRUE)
}

extract_comment_value <- function(lines, prefix) {
  hit <- lines[startsWith(lines, prefix)]
  if (length(hit) == 0L) return(NA_character_)
  out <- sub(paste0("^", prefix), "", hit[[1L]], perl = TRUE)
  out <- sub(" -->$", "", out, perl = TRUE)
  trimws(out)
}

flatten_rd <- function(x) {
  if (is.null(x)) return("")
  if (is.character(x)) return(paste(x, collapse = ""))
  if (is.list(x)) {
    parts <- vapply(x, flatten_rd, character(1L), USE.NAMES = FALSE)
    return(paste(parts, collapse = ""))
  }
  as.character(x)
}

rd_section_text <- function(rd, tag) {
  tags <- vapply(
    rd,
    function(x) {
      value <- attr(x, "Rd_tag")
      if (is.null(value)) "" else as.character(value)
    },
    character(1L)
  )
  pos <- which(tags == tag)
  if (length(pos) == 0L) return("")
  normalize_ws(flatten_rd(rd[[pos[[1L]]]]))
}

package_metadata <- function(package_name) {
  desc <- tryCatch(
    utils::packageDescription(package_name),
    error = function(e) NULL
  )

  if (is.null(desc)) {
    return(list(title = "", description = ""))
  }

  title <- if (!is.null(desc$Title)) normalize_ws(desc$Title) else ""
  description <- if (!is.null(desc$Description)) normalize_ws(desc$Description) else ""
  list(title = title, description = description)
}

read_cache_rows <- function(root) {
  files <- list.files(
    root,
    pattern = "\\.md$",
    recursive = TRUE,
    full.names = TRUE
  )

  files <- files[basename(files) != "index.md" & basename(files) != "README.md"]
  rows <- list()
  root_norm <- normalizePath(root, winslash = "/", mustWork = TRUE)

  for (file in files) {
    head_lines <- readLines(file, n = 8L, warn = FALSE, encoding = "UTF-8")
    if (length(head_lines) == 0L || !startsWith(head_lines[[1L]], "<!-- r-help-cache-meta ")) next

    first <- head_lines[[1L]]
    package <- extract_marker_value(first, "package")
    topic_value <- extract_marker_value(first, "topic")
    package_version <- extract_marker_value(first, "package-version")
    r_version <- extract_marker_value(first, "r-version")
    help_title <- extract_comment_value(head_lines, "<!-- r-help-cache-title: ")
    help_description <- extract_comment_value(head_lines, "<!-- r-help-cache-description: ")

    if (anyNA(c(package, topic_value, package_version, r_version))) next
    if (is.na(help_title)) help_title <- topic_value
    if (is.na(help_description)) help_description <- ""

    file_norm <- normalizePath(file, winslash = "/", mustWork = FALSE)
    rel <- substring(file_norm, nchar(root_norm) + 2L)

    rows[[length(rows) + 1L]] <- data.frame(
      package = package,
      topic = topic_value,
      title = help_title,
      description = help_description,
      package_version = package_version,
      r_version = r_version,
      rel = rel,
      stringsAsFactors = FALSE
    )
  }

  if (length(rows) == 0L) return(NULL)
  do.call(rbind, rows)
}

write_package_index <- function(root, package_name, rows) {
  package_slug <- safe_slug(package_name)
  package_dir <- file.path(root, package_slug)
  dir.create(package_dir, recursive = TRUE, showWarnings = FALSE)

  meta <- package_metadata(package_name)
  versions <- unique(rows$package_version)
  r_versions <- unique(rows$r_version)

  header <- c(
    sprintf("# `%s` local help cache", package_name),
    "",
    sprintf("- Package title: %s", if (nzchar(meta$title)) meta$title else "not available"),
    sprintf("- Package description: %s", if (nzchar(meta$description)) meta$description else "not available"),
    sprintf("- Cached package version(s): %s", paste(versions, collapse = ", ")),
    sprintf("- Cached R version(s): %s", paste(r_versions, collapse = ", ")),
    sprintf("- Cached topics: %d", nrow(rows)),
    "",
    "This index is generated from help pages already cached from the local R installation. Use it for discovery only; validate a topic with `r-help-cache` before relying on its API in a new session.",
    "",
    "| Topic | Title | Description | Help |",
    "|---|---|---|---|"
  )

  rows <- rows[order(tolower(rows$topic), tolower(rows$title)), , drop = FALSE]
  body <- vapply(
    seq_len(nrow(rows)),
    function(i) {
      help_file <- basename(rows$rel[[i]])
      sprintf(
        "| `%s` | %s | %s | [open](%s) |",
        markdown_cell(rows$topic[[i]]),
        markdown_cell(rows$title[[i]], 160L),
        markdown_cell(rows$description[[i]], 280L),
        help_file
      )
    },
    character(1L)
  )

  writeLines(enc2utf8(c(header, body, "")), file.path(package_dir, "index.md"), useBytes = TRUE)
}

write_main_index <- function(root, table = NULL) {
  header <- c(
    "# Local R help cache",
    "",
    "This is the package-level catalogue for documentation already cached from the locally installed R environment.",
    "",
    "Each package has its own index containing cached topics, help titles, and short descriptions. The full help text remains in the individual topic pages.",
    "",
    "| Package | Package title | Package description | Cached topics |",
    "|---|---|---|---:|"
  )

  if (is.null(table) || nrow(table) == 0L) {
    body <- "| - | No cached packages yet | - | 0 |"
  } else {
    packages <- sort(unique(table$package))
    body <- vapply(
      packages,
      function(package_name) {
        meta <- package_metadata(package_name)
        n_topics <- sum(table$package == package_name)
        sprintf(
          "| [`%s`](%s/index.md) | %s | %s | %d |",
          markdown_cell(package_name),
          safe_slug(package_name),
          markdown_cell(meta$title, 160L),
          markdown_cell(meta$description, 280L),
          n_topics
        )
      },
      character(1L)
    )
  }

  writeLines(enc2utf8(c(header, body, "")), file.path(root, "index.md"), useBytes = TRUE)
}

write_cache_indexes <- function(root) {
  table <- read_cache_rows(root)
  if (is.null(table) || nrow(table) == 0L) {
    write_main_index(root, NULL)
    return(invisible(NULL))
  }

  for (package_name in sort(unique(table$package))) {
    write_package_index(
      root,
      package_name,
      table[table$package == package_name, , drop = FALSE]
    )
  }

  write_main_index(root, table)
  invisible(NULL)
}

package_value <- if (nzchar(package_arg) && !identical(toupper(package_arg), "AUTO")) package_arg else NULL

lookup_help <- function(topic_value, package_value = NULL, try_all_packages = FALSE) {
  help_args <- list(topic = topic_value, help_type = "text")

  if (!is.null(package_value)) help_args$package <- package_value
  if (isTRUE(try_all_packages)) help_args$try.all.packages <- TRUE

  suppressWarnings(do.call(utils::help, help_args))
}

h <- lookup_help(
  topic_value = topic,
  package_value = package_value,
  try_all_packages = is.null(package_value)
)

if (length(h) == 0L) {
  if (is.null(package_value)) {
    stop(
      sprintf(
        "Help topic '%s' was not found. Supply the package explicitly if it is installed but not attached.",
        topic
      ),
      call. = FALSE
    )
  }
  stop(
    sprintf("Help topic '%s' was not found in package '%s'.", topic, package_value),
    call. = FALSE
  )
}

help_paths <- as.character(h)
packages <- unique(vapply(help_paths, package_from_help_path, character(1L)))
packages <- packages[!is.na(packages) & nzchar(packages)]

if (is.null(package_value)) {
  if (length(packages) == 0L) {
    stop("The help topic was found, but its package could not be determined. Rerun with an explicit package.", call. = FALSE)
  }
  if (length(packages) > 1L) {
    stop(
      sprintf(
        "Help topic '%s' is ambiguous. Rerun with one of these packages: %s",
        topic,
        paste(packages, collapse = ", ")
      ),
      call. = FALSE
    )
  }
  package_value <- packages[[1L]]
  h <- lookup_help(topic_value = topic, package_value = package_value)
}

if (length(h) > 1L) h <- h[1L]

package_version <- tryCatch(
  as.character(utils::packageVersion(package_value)),
  error = function(e) NA_character_
)

if (is.na(package_version)) {
  stop(sprintf("Could not determine the installed version of package '%s'.", package_value), call. = FALSE)
}

r_version <- paste(R.version$major, R.version$minor, sep = ".")
package_dir <- file.path(cache_root, safe_slug(package_value))
dir.create(package_dir, recursive = TRUE, showWarnings = FALSE)
cache_file <- file.path(package_dir, paste0(safe_slug(topic), ".md"))

marker <- sprintf(
  '<!-- r-help-cache-meta schema="2" topic="%s" package="%s" package-version="%s" r-version="%s" -->',
  topic,
  package_value,
  package_version,
  r_version
)

status <- "CREATED"

if (file.exists(cache_file)) {
  first <- readLines(cache_file, n = 1L, warn = FALSE, encoding = "UTF-8")
  if (length(first) == 1L && identical(first, marker)) {
    status <- "CACHE_HIT"
  } else {
    status <- "UPDATED"
  }
}

if (status != "CACHE_HIT") {
  rd <- utils:::.getHelpFile(h)
  help_title <- rd_section_text(rd, "\\title")
  help_description <- rd_section_text(rd, "\\description")

  if (!nzchar(help_title)) help_title <- topic

  help_text <- capture.output(tools::Rd2txt(rd, out = ""))
  help_text <- escape_fence(strip_overstrike(help_text))

  generated_at <- format(Sys.time(), "%Y-%m-%d %H:%M:%S %z")

  content <- c(
    marker,
    sprintf("<!-- r-help-cache-title: %s -->", comment_value(help_title)),
    sprintf("<!-- r-help-cache-description: %s -->", comment_value(help_description)),
    "<!-- AUTO-GENERATED FILE. DO NOT EDIT MANUALLY. -->",
    sprintf("# `%s::%s`", package_value, topic),
    "",
    sprintf("- Topic: `%s`", topic),
    sprintf("- Package: `%s`", package_value),
    sprintf("- Help title: %s", help_title),
    sprintf("- Help description: %s", if (nzchar(help_description)) help_description else "not available"),
    sprintf("- Package version: `%s`", package_version),
    sprintf("- R version: `%s`", r_version),
    sprintf("- Generated from local help: `%s`", generated_at),
    "",
    "This page records software documentation from the local R installation. It does not by itself validate broader statistical or scientific claims.",
    "",
    "## Local help text",
    "",
    "````text",
    help_text,
    "````",
    ""
  )

  writeLines(enc2utf8(content), cache_file, useBytes = TRUE)
}

write_cache_indexes(cache_root)

cat(sprintf("STATUS: %s\n", status))
cat(sprintf("TOPIC: %s\n", topic))
cat(sprintf("PACKAGE: %s\n", package_value))
cat(sprintf("R_VERSION: %s\n", r_version))
cat(sprintf("PACKAGE_VERSION: %s\n", package_version))
cat(sprintf("FILE: %s\n", normalizePath(cache_file, winslash = "/", mustWork = TRUE)))
cat(sprintf("PACKAGE_INDEX: %s\n", normalizePath(file.path(package_dir, "index.md"), winslash = "/", mustWork = TRUE)))
cat(sprintf("MAIN_INDEX: %s\n", normalizePath(file.path(cache_root, "index.md"), winslash = "/", mustWork = TRUE)))
